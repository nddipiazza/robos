extends RefCounted

const Campaign = preload("res://scripts/engine/RTSCampaign.gd")

const INITIAL_CREDITS := 100000

const MISSION_META := [
	{
		"sector": "Vesper Gate Colony",
		"planet_name": "VESPER IV",
		"credits": 45000,
		"contact": "Captain Vale",
		"portrait": "vale",
		"voice_cue": "arrival",
		"tech_unit": "rifleman",
		"tech_title": "Rifleman",
		"tech_desc": "Versatile frontline infantry armed with the R-9 Carbine. Effective against ground and air threats.",
		"research_label": "",
		"planet": {
			"primary": Color("#7c6348"), "secondary": Color("#3a4e5c"), "accent": Color("#c8a882"),
			"atmo": Color("#6cb4e8"), "clouds": 0.42, "glow": Color("#ffad5c"), "glow_strength": 0.28, "seed": 1.1,
		},
	},
	{
		"sector": "White Ridge Excavation",
		"planet_name": "VESPER HIGHLANDS",
		"credits": 50000,
		"contact": "Captain Vale",
		"portrait": "vale",
		"voice_cue": "dig_brief",
		"tech_unit": "triage_specialist",
		"tech_title": "Triage Specialist",
		"tech_desc": "Combat field medic trained at Muster Halls with a Research Module. Restores biological troop health.",
		"research_label": "",
		"planet": {
			"primary": Color("#8b949e"), "secondary": Color("#465869"), "accent": Color("#dce6f0"),
			"atmo": Color("#8fd1ff"), "clouds": 0.50, "glow": Color("#6be4ff"), "glow_strength": 0.16, "seed": 2.4,
		},
	},
	{
		"sector": "Twilight Crossing",
		"planet_name": "DAWN REACH",
		"credits": 55000,
		"contact": "Pilot Sable",
		"portrait": "sable",
		"voice_cue": "siege",
		"tech_unit": "field_bunker",
		"tech_title": "Field Bunker",
		"tech_desc": "Defensive fortification that shelters up to four infantry squads behind reinforced armor.",
		"research_label": "",
		"planet": {
			"primary": Color("#a45938"), "secondary": Color("#542b1c"), "accent": Color("#d8946c"),
			"atmo": Color("#d98b5f"), "clouds": 0.24, "glow": Color("#ff7640"), "glow_strength": 0.22, "seed": 3.7,
		},
	},
	{
		"sector": "Bracken Evacuation Corridor",
		"planet_name": "AGRIA FRONTIER",
		"credits": 75000,
		"contact": "Dr. Aster",
		"portrait": "aster",
		"voice_cue": "intro_m04_surface",
		"tech_unit": "torchguard",
		"tech_title": "Torchguard",
		"tech_desc": "Heavy armored close-assault infantry whose twin flame jets sweep clustered Brood swarms.",
		"research_label": "+3 Brood Research",
		"planet": {
			"primary": Color("#75834a"), "secondary": Color("#384a36"), "accent": Color("#c4b274"),
			"atmo": Color("#9ad48b"), "clouds": 0.46, "glow": Color("#a9ff7a"), "glow_strength": 0.18, "seed": 4.9,
		},
	},
	{
		"sector": "Ashfall Settlement",
		"planet_name": "ASHFALL HAVEN",
		"credits": 85000,
		"contact": "Captain Vale",
		"portrait": "vale",
		"voice_cue": "quarantine_start",
		"tech_unit": "cinder_runner",
		"tech_title": "Cinder Runner",
		"tech_desc": "High-speed reconnaissance buggy fitted with a line-splash incinerator cannon.",
		"research_label": "+2 Brood Research",
		"planet": {
			"primary": Color("#584d4a"), "secondary": Color("#2a2426"), "accent": Color("#9c7865"),
			"atmo": Color("#b87c5c"), "clouds": 0.34, "glow": Color("#ff6838"), "glow_strength": 0.42, "seed": 6.2,
		},
	},
	{
		"sector": "Redstone Tectonic Basin",
		"planet_name": "REDSTONE",
		"credits": 95000,
		"contact": "Pilot Sable",
		"portrait": "sable",
		"voice_cue": "intro_m06_surface",
		"tech_unit": "ridge_scout",
		"tech_title": "Ridge Scout",
		"tech_desc": "Jump-pack reconnaissance infantry that vaults cliffs and hurls timed demolition charges.",
		"research_label": "+3 Brood Research",
		"planet": {
			"primary": Color("#6e291d"), "secondary": Color("#2b110d"), "accent": Color("#d45d2a"),
			"atmo": Color("#ff6a33"), "clouds": 0.18, "glow": Color("#ff4500"), "glow_strength": 0.78, "seed": 7.5,
		},
	},
	{
		"sector": "Talion Sunken Temple",
		"planet_name": "TALION",
		"credits": 100000,
		"contact": "Captain Vale",
		"portrait": "vale",
		"voice_cue": "shrine_start",
		"tech_unit": "breacher",
		"tech_title": "Breacher",
		"tech_desc": "Armored heavy infantry armed with concussive breach shells that shatter plating and slow targets.",
		"research_label": "+4 Concord Research",
		"planet": {
			"primary": Color("#3b6e5c"), "secondary": Color("#1d3b42"), "accent": Color("#8cc7a8"),
			"atmo": Color("#5ee2c8"), "clouds": 0.52, "glow": Color("#5ef2ff"), "glow_strength": 0.32, "seed": 8.8,
		},
	},
	{
		"sector": "Sanctuary Orbital Ring",
		"planet_name": "SANCTUARY",
		"credits": 110000,
		"contact": "Dr. Aster",
		"portrait": "aster",
		"voice_cue": "sanctuary_start",
		"tech_unit": "kestrel_interceptor",
		"tech_title": "Kestrel Interceptor",
		"tech_desc": "Twin-vector air superiority fighter built to break capital shielding and patrol colony skies.",
		"research_label": "+3 Brood Research",
		"planet": {
			"primary": Color("#3b6d8c"), "secondary": Color("#1b3554"), "accent": Color("#9cd4e8"),
			"atmo": Color("#66c4ff"), "clouds": 0.58, "glow": Color("#7cf0ff"), "glow_strength": 0.35, "seed": 10.1,
		},
	},
	{
		"sector": "Tarsus Freight Line",
		"planet_name": "TARSUS",
		"credits": 115000,
		"contact": "Corporal Rook",
		"portrait": "rook",
		"voice_cue": "intro_m09_surface",
		"tech_unit": "rail_skimmer",
		"tech_title": "Rail Skimmer",
		"tech_desc": "Fast magnetic-cushion strike tank capable of firing its heavy railgun at full speed.",
		"research_label": "+3 Brood Research",
		"planet": {
			"primary": Color("#9c7248"), "secondary": Color("#593c24"), "accent": Color("#dfb37c"),
			"atmo": Color("#e0a96d"), "clouds": 0.22, "glow": Color("#ffb35c"), "glow_strength": 0.25, "seed": 11.4,
		},
	},
	{
		"sector": "Verdant Canopy",
		"planet_name": "BEL'VERDANT",
		"credits": 120000,
		"contact": "Dr. Aster",
		"portrait": "aster",
		"voice_cue": "verdant_pressure_start",
		"tech_unit": "warden_walker",
		"tech_title": "Warden Walker",
		"tech_desc": "All-terrain bipedal combat walker armed with twin autocannons and long-range escort missiles.",
		"research_label": "+3 Concord Research",
		"planet": {
			"primary": Color("#2e7345"), "secondary": Color("#174030"), "accent": Color("#7ad67e"),
			"atmo": Color("#62f099"), "clouds": 0.48, "glow": Color("#55ffaa"), "glow_strength": 0.36, "seed": 12.7,
		},
	},
	{
		"sector": "Aurelia Sealed Vault",
		"planet_name": "AURELIA PRIME",
		"credits": 135000,
		"contact": "Captain Vale",
		"portrait": "vale",
		"voice_cue": "vaultbreaker_start",
		"tech_unit": "howitzer",
		"tech_title": "Howitzer",
		"tech_desc": "Heavy mobile artillery piece that anchors into long-range Emplaced Mode to shell approaches.",
		"research_label": "+3 Concord Research",
		"planet": {
			"primary": Color("#6d687a"), "secondary": Color("#322e42"), "accent": Color("#c2b8dc"),
			"atmo": Color("#7de8ff"), "clouds": 0.30, "glow": Color("#4ef4ff"), "glow_strength": 0.52, "seed": 14.0,
		},
	},
]

const ARMORY_CATEGORIES := [
	{
		"id": "base",
		"label": "Base",
		"units": [
			{
				"unit_id": "colony_hub", "name": "Colony Hub",
				"upgrades": [
					{
						"id": "hub_plating", "name": "Neosteel Bulkheads", "cost": 40000, "glyph": "armor_plate",
						"summary": "+2 Colony Hub armor and fire suppression.",
						"desc": "Reinforces primary command superstructures with layered neosteel plating and automated hull sealants, allowing frontier bases to hold under sustained siege fire.",
					},
					{
						"id": "hub_servos", "name": "Dual Arc Gantries", "cost": 65000, "glyph": "welder",
						"summary": "Allows two Pioneers to accelerate structure assembly.",
						"desc": "Equips Colony Hub fabrication bays with synchronized arc-welding beacons so field construction teams bring defensive lines online markedly faster.",
					},
				],
			},
			{
				"unit_id": "field_bunker", "name": "Field Bunker",
				"upgrades": [
					{
						"id": "bunker_ports", "name": "Stabilized Firing Ports", "cost": 45000, "glyph": "range_scope",
						"summary": "+1 weapon range for garrisoned infantry.",
						"desc": "Replaces standard embrasures with gyro-damped magnetic rails, extending the effective engagement envelope of Riflemen, Breachers, and Torchguards inside the bunker.",
					},
					{
						"id": "bunker_casemate", "name": "Expanded Casemate", "cost": 55000, "glyph": "bunker_plus",
						"summary": "+2 infantry capacity and +150 Bunker HP.",
						"desc": "Sub-surface ammo lockers and reinforced blast ribs expand internal squad berths from four to six soldiers while absorbing heavy artillery impacts.",
					},
				],
			},
			{
				"unit_id": "sentry_turret", "name": "Sentry Turret",
				"upgrades": [
					{
						"id": "turret_salvo", "name": "Tempest Micro-Pods", "cost": 50000, "glyph": "multi_missile",
						"summary": "Fires secondary anti-air micro-missiles per volley.",
						"desc": "Mounts side-saddle fragmentation pods beside the primary launcher, saturating clustered Needlewing and Concord air squadrons.",
					},
					{
						"id": "turret_housing", "name": "Titanium Gimbal", "cost": 40000, "glyph": "shield_hex",
						"summary": "+75 HP and +2 Turret base armor.",
						"desc": "Encases exposed tracking optics and ammunition feeds inside sloped titanium-carbide shrouds.",
					},
				],
			},
			{
				"unit_id": "silo", "name": "Provision Silo",
				"upgrades": [
					{
						"id": "silo_hydraulics", "name": "Rapid Gate Actuators", "cost": 35000, "glyph": "gear_bolt",
						"summary": "Instant gate retraction and 35% faster construction.",
						"desc": "High-pressure pneumatic rams cycle wall segments immediately when friendly armor columns transit the perimeter.",
					},
					{
						"id": "silo_stores", "name": "Deep-Core Lockers", "cost": 50000, "glyph": "supply_crate",
						"summary": "+2 additional supply provided per Provision Silo.",
						"desc": "Pressurized subterranean ration and ordnance magazines increase the army support ceiling of every deployed silo.",
					},
				],
			},
			{
				"unit_id": "pioneer", "name": "Pioneer",
				"upgrades": [
					{
						"id": "pioneer_welders", "name": "Twin-Fusion Torches", "cost": 40000, "glyph": "plasma_spark",
						"summary": "Pioneers repair mechanical units twice as fast.",
						"desc": "Dual-nozzle plasma torches fuse damaged walker joints and bunker plating at double standard field output.",
					},
					{
						"id": "pioneer_rig", "name": "Exo-Frame Harness", "cost": 35000, "glyph": "exo_frame",
						"summary": "+15 Pioneer hit points against raids.",
						"desc": "Roll-cage shoulder guards and blast visors keep mining crews alive under harassment fire.",
					},
				],
			},
		],
	},
	{
		"id": "infantry",
		"label": "Infantry",
		"units": [
			{
				"unit_id": "rifleman", "name": "Rifleman",
				"upgrades": [
					{
						"id": "rifle_shield", "name": "Ballistic Riot Shield", "cost": 45000, "glyph": "riot_shield",
						"summary": "Riflemen gain +10 permanent maximum HP.",
						"desc": "Forearm-mounted composite shields deflect acid spines and shrapnel without slowing R-9 Carbine reload drills.",
					},
					{
						"id": "rifle_surge", "name": "Filtered Surge Ampoules", "cost": 40000, "glyph": "syringe",
						"summary": "Surge Injector costs 50% less health and lasts longer.",
						"desc": "Synthetic neural buffers eliminate cardiovascular shock when triggering combat stims during kiting maneuvers.",
					},
				],
			},
			{
				"unit_id": "triage_specialist", "name": "Triage Medic",
				"upgrades": [
					{
						"id": "medic_injector", "name": "Nano-Suture Beam", "cost": 50000, "glyph": "med_cross",
						"summary": "Restores biological health 30% faster.",
						"desc": "Coherent cellular coagulants seal trauma wounds rapidly even while frontline squads remain under direct fire.",
					},
					{
						"id": "medic_cells", "name": "Capacitor Caduceus", "cost": 45000, "glyph": "battery_plus",
						"summary": "+50 starting energy and reduced heal drain.",
						"desc": "High-density medical power packs sustain continuous triage across prolonged multi-wave engagements.",
					},
				],
			},
			{
				"unit_id": "torchguard", "name": "Torchguard",
				"upgrades": [
					{
						"id": "torch_nozzles", "name": "Pyro-Gel Accelerant", "cost": 55000, "glyph": "flame_jet",
						"summary": "Widens Twin Flame Jet sweep area by 40%.",
						"desc": "Pressurized hypergolic fuel clings to ground targets across a broader cone, incinerating dense Skitterling packs.",
					},
					{
						"id": "torch_suit", "name": "Juggernaut Ceramite", "cost": 60000, "glyph": "heavy_helm",
						"summary": "+2 base armor against melee and light fire.",
						"desc": "Kiln-fired thermal plates shrug off claws and corrosive bile at point-blank range.",
					},
				],
			},
			{
				"unit_id": "ridge_scout", "name": "Ridge Scout",
				"upgrades": [
					{
						"id": "scout_thrusters", "name": "Overcharged Jump-Jets", "cost": 45000, "glyph": "wing_boot",
						"summary": "+20% movement speed and faster out-of-combat regen.",
						"desc": "Vectored cold-gas nozzles sharpen cliff transitions and rapid flanking strikes across canyon plateaus.",
					},
					{
						"id": "scout_charges", "name": "Shaped Detonation Packs", "cost": 55000, "glyph": "satchel_bomb",
						"summary": "Ridge Charges deal +50% damage to structures.",
						"desc": "Copper-lined demolition charges punch cleanly through reinforced Directorate turrets and Brood nests.",
					},
				],
			},
			{
				"unit_id": "breacher", "name": "Breacher",
				"upgrades": [
					{
						"id": "breacher_shells", "name": "Shockwave Sabots", "cost": 60000, "glyph": "concussive_wave",
						"summary": "Concussive slow splashes to nearby hostile units.",
						"desc": "Sub-munitions disperse kinetic shock rings on impact, stalling entire advancing columns in choke points.",
					},
					{
						"id": "breacher_foam", "name": "Kinetic Trauma Liner", "cost": 65000, "glyph": "armor_plate",
						"summary": "Breachers gain +25 maximum HP.",
						"desc": "Non-Newtonian impact gel beneath the chest cuirass absorbs heavy anti-armor bolts.",
					},
				],
			},
		],
	},
	{
		"id": "vehicles",
		"label": "Vehicles",
		"units": [
			{
				"unit_id": "cinder_runner", "name": "Cinder Runner",
				"upgrades": [
					{
						"id": "cinder_napalm", "name": "Blue-Core Igniter", "cost": 50000, "glyph": "flame_jet",
						"summary": "+10 bonus damage vs Light targets.",
						"desc": "Cobalt-enriched plasma injectors superheat the buggy's flame plume to melt through infested waves.",
					},
					{
						"id": "cinder_tires", "name": "Torsion Bogie Drive", "cost": 45000, "glyph": "wheel_turbo",
						"summary": "Increases road and canyon acceleration.",
						"desc": "Independent magnetic suspension keeps four-wheel traction locked through sharp convoy hairpins.",
					},
				],
			},
			{
				"unit_id": "rail_skimmer", "name": "Rail Skimmer",
				"upgrades": [
					{
						"id": "skimmer_coils", "name": "Tri-Lithium Rails", "cost": 70000, "glyph": "rail_bolt",
						"summary": "+2 Skimmer Railgun firing range.",
						"desc": "Extended superconducting barrel rails let skimmers kite heavy walkers and freight escorts safely.",
					},
					{
						"id": "skimmer_hull", "name": "Flux-Skirt Plating", "cost": 65000, "glyph": "shield_hex",
						"summary": "+50 maximum Rail Skimmer HP.",
						"desc": "Armors the hover manifold against mines and flanking infantry volleys.",
					},
				],
			},
			{
				"unit_id": "warden_walker", "name": "Warden Walker",
				"upgrades": [
					{
						"id": "walker_lock", "name": "Dual-Target Fire Control", "cost": 70000, "glyph": "crosshair_dual",
						"summary": "Fires autocannons and air missiles simultaneously.",
						"desc": "Splits turret fire-control processors so walkers engage ground escorts without interrupting anti-air missile locks.",
					},
					{
						"id": "walker_optics", "name": "Ares Horizon Radar", "cost": 65000, "glyph": "range_scope",
						"summary": "+3 missile range and +1 autocannon range.",
						"desc": "Mast-mounted millimeter radar tracks high-altitude flyers well before they enter weapon range.",
					},
				],
			},
			{
				"unit_id": "howitzer", "name": "Howitzer",
				"upgrades": [
					{
						"id": "howitzer_shells", "name": "Maelstrom Siege Rounds", "cost": 85000, "glyph": "artillery_shell",
						"summary": "+20 primary impact damage in Emplaced Mode.",
						"desc": "Tandem-charge artillery shells obliterate entrenched bunkers and heavy armored columns on direct impact.",
					},
					{
						"id": "howitzer_fuze", "name": "IFF Smart-Fuze", "cost": 75000, "glyph": "radar_pulse",
						"summary": "Reduces splash damage to friendly troops by 75%.",
						"desc": "Directional fragmentation rings vent blast energy away from Meridian infantry transponders.",
					},
				],
			},
			{
				"unit_id": "atlas_walker", "name": "Atlas Walker",
				"upgrades": [
					{
						"id": "atlas_cannons", "name": "330mm Strike Cannons", "cost": 95000, "glyph": "heavy_cannon",
						"summary": "Unlocks devastating stun barrage against structures.",
						"desc": "Dorsal siege barrels hammer fortified emplacements and massive bio-titans into submission.",
					},
					{
						"id": "atlas_core", "name": "Self-Righting Gyros", "cost": 85000, "glyph": "gear_bolt",
						"summary": "+150 HP and emergency field reboot system.",
						"desc": "Redundant fusion actuators keep the heavy walker operational under concentrated anti-armor fire.",
					},
				],
			},
		],
	},
	{
		"id": "starships",
		"label": "Starships",
		"units": [
			{
				"unit_id": "rampart_transport", "name": "Rampart",
				"upgrades": [
					{
						"id": "rampart_winch", "name": "Rapid Drop Cradles", "cost": 50000, "glyph": "drop_arrow",
						"summary": "Deploys embarked squads instantaneously.",
						"desc": "Magnetic launch rails eject infantry and vehicles simultaneously into hot landing zones.",
					},
					{
						"id": "rampart_burners", "name": "Twin-Vector Burners", "cost": 60000, "glyph": "wing_boot",
						"summary": "+25% Rampart cruise and boost speed.",
						"desc": "High-bypass orbital thrusters outrun interceptor patrols during evacuation runs.",
					},
				],
			},
			{
				"unit_id": "sky_sentry", "name": "Sky Sentry",
				"upgrades": [
					{
						"id": "sentry_drone", "name": "Laser Defense Matrix", "cost": 70000, "glyph": "radar_pulse",
						"summary": "Intercepts hostile ranged projectiles in radius.",
						"desc": "Deploys an automated point-defense emitter that zaps incoming acid spines and missiles mid-flight.",
					},
					{
						"id": "sentry_reactor", "name": "Beamed Core Cells", "cost": 60000, "glyph": "battery_plus",
						"summary": "+50 maximum energy and faster recharge.",
						"desc": "Sustains prolonged tactical support deployments over forward strike groups.",
					},
				],
			},
			{
				"unit_id": "kestrel_interceptor", "name": "Kestrel",
				"upgrades": [
					{
						"id": "kestrel_ripwave", "name": "Ripwave Missile Pods", "cost": 75000, "glyph": "multi_missile",
						"summary": "Fires area-damage anti-air missile volleys.",
						"desc": "Ripwave warheads detonate in overlapping shock-spheres that shred tightly massed enemy flyers across a wide air corridor.",
					},
					{
						"id": "kestrel_phobos", "name": "Phobos Targeting Suite", "cost": 65000, "glyph": "range_scope",
						"summary": "+2 air-to-air weapon range.",
						"desc": "Long-baseline optical sensors lock onto capital ships and spore flyers outside return-fire envelopes.",
					},
				],
			},
			{
				"unit_id": "night_harrier", "name": "Night Harrier",
				"upgrades": [
					{
						"id": "harrier_shock", "name": "Shockwave Rocket Line", "cost": 80000, "glyph": "artillery_shell",
						"summary": "Ground-attack rockets deal linear splash damage.",
						"desc": "Replaces single-point warheads with cascading cluster rockets ideal for raking mineral lines and convoys.",
					},
					{
						"id": "harrier_cloak", "name": "Thermal Baffling", "cost": 75000, "glyph": "cloak_eye",
						"summary": "Doubles stealth flight duration.",
						"desc": "Cooled exhaust vanes mask infrared signatures while slipping past perimeter anti-air.",
					},
				],
			},
			{
				"unit_id": "dreadnought", "name": "Dreadnought",
				"upgrades": [
					{
						"id": "dread_lance", "name": "Axial Plasma Batteries", "cost": 100000, "glyph": "rail_bolt",
						"summary": "+25% main battery fire rate and lance charge.",
						"desc": "Links secondary fusion taps directly into the flagship's forward capacitor banks.",
					},
					{
						"id": "dread_matrix", "name": "Aegis Deflector Grid", "cost": 90000, "glyph": "shield_hex",
						"summary": "Absorbs up to 200 burst damage when triggered.",
						"desc": "Reverse-engineered harmonic emitters project a temporary ablative barrier across the hull.",
					},
				],
			},
		],
	},
	{
		"id": "special",
		"label": "Special Ops",
		"units": [
			{
				"unit_id": "shade_agent", "name": "Shade Agent",
				"upgrades": [
					{
						"id": "shade_ocular", "name": "Ocular Telemetry", "cost": 65000, "glyph": "range_scope",
						"summary": "+3 sight radius and +2 sniper range.",
						"desc": "Multi-spectrum retinal lenses spot burrowed and veiled threats well ahead of the main column.",
					},
					{
						"id": "shade_suit", "name": "Permanent Veil Cell", "cost": 85000, "glyph": "cloak_eye",
						"summary": "Cloaking no longer drains continuous energy.",
						"desc": "Zero-point phase weave bends ambient light passively, reserving suit energy for tactical strikes.",
					},
				],
			},
			{
				"unit_id": "sentinel_mine", "name": "Sentinel Mine",
				"upgrades": [
					{
						"id": "mine_claws", "name": "Auger Digging Claws", "cost": 45000, "glyph": "gear_bolt",
						"summary": "Burrows and rearms 50% faster.",
						"desc": "Carbide rotary drills sink mines beneath canyon rock in moments.",
					},
					{
						"id": "mine_payload", "name": "Cerberus Warhead", "cost": 50000, "glyph": "satchel_bomb",
						"summary": "+30% trigger and blast splash radius.",
						"desc": "High-impulse plasma core devastates pursuing packs crossing mined approaches.",
					},
				],
			},
			{
				"unit_id": "vortex_rover", "name": "Vortex Rover",
				"upgrades": [
					{
						"id": "rover_lock", "name": "Mag-Field Accelerators", "cost": 65000, "glyph": "crosshair_dual",
						"summary": "+25% lock-on missile damage vs Armored.",
						"desc": "Hyper-velocity kinetic darts punch straight through Concord walkers and Directorate tanks.",
					},
					{
						"id": "rover_drive", "name": "Overdrive Gyros", "cost": 55000, "glyph": "wheel_turbo",
						"summary": "Increases reverse-kiting tracking speed.",
						"desc": "Keeps target locks unbroken across rugged elevation transitions.",
					},
				],
			},
			{
				"unit_id": "bastion_turret", "name": "Bastion Turret",
				"upgrades": [
					{
						"id": "bastion_rail", "name": "Twin Siege Breeches", "cost": 70000, "glyph": "heavy_cannon",
						"summary": "+20% anti-surface fire rate.",
						"desc": "Autoloading rotary drums turn forward strongpoints into impassable kill zones.",
					},
					{
						"id": "bastion_plate", "name": "Fortress Anchor", "cost": 55000, "glyph": "armor_plate",
						"summary": "+200 HP and +2 structural armor.",
						"desc": "Deep bedrock pilings brace the turret against heavy siege barrages.",
					},
				],
			},
		],
	},
]

const MERCENARIES := [
	{
		"id": "merc_roadwardens", "name": "Bracken Roadwardens", "unit_id": "rifleman", "cost": 0,
		"squad_label": "4 Veteran Riflemen  ·  +45% HP",
		"summary": "Chartered frontier convoy guards unlocked for rapid Contract Post deployment.",
		"desc": "Hardened militia veterans who held the Bracken evacuation highway. Deploys in four-man squads with heavy flak vests and tuned carbines.",
	},
	{
		"id": "merc_ashhounds", "name": "Ashfall Hellhounds", "unit_id": "torchguard", "cost": 35000,
		"squad_label": "3 Elite Torchguards  ·  +35% HP & +25% Damage",
		"summary": "Quarantine breach specialists clad in slag-forged thermal armor.",
		"desc": "Volunteers who burned out the old Ashfall foundry districts. Their custom twin-nozzle rigs run hotter than standard Guard regulation allows.",
	},
	{
		"id": "merc_ironbacks", "name": "Vesper Ironbacks", "unit_id": "breacher", "cost": 45000,
		"squad_label": "2 Heavy Breachers  ·  +40% HP & +25% Damage",
		"summary": "Former Directorate shock-troopers now fighting under Captain Vale's banner.",
		"desc": "Outfitted with prototype siege-grade concussion launchers capable of halting armored pushes dead in their tracks.",
	},
	{
		"id": "merc_outriders", "name": "Tarsus Rail Raiders", "unit_id": "rail_skimmer", "cost": 60000,
		"squad_label": "2 Modified Rail Skimmers  ·  +30% Speed & Rail Output",
		"summary": "Outlaw hover-tank aces from the Tarsus badlands.",
		"desc": "Stripped limiter coils let the Rail Raiders circle Directorate columns at breakneck speed while hammering flanks with depleted-tungsten slugs.",
	},
	{
		"id": "merc_deadfall", "name": "Deadfall Siege Battery", "unit_id": "howitzer", "cost": 75000,
		"squad_label": "2 Heavy Howitzers  ·  +35% Siege Shell Damage",
		"summary": "Veteran canyon artillerymen with custom long-bore barrels.",
		"desc": "Renowned across the Rim for holding White Ridge for nine days straight. Their emplaced salvos shatter entire assault waves before contact.",
	},
	{
		"id": "merc_angels", "name": "Duskwing Squadron", "unit_id": "kestrel_interceptor", "cost": 70000,
		"squad_label": "3 Ace Kestrel Interceptors  ·  +30% Hull & Salvo Rate",
		"summary": "Elite orbital escort wing led by Pilot Sable's former flight.",
		"desc": "Precision interceptor aces flying up-engined Kestrel airframes with high-capacity missile racks.",
	},
]

const LAB_TRACKS := {
	"brood": {
		"title": "GNARL BROOD XENOBIOLOGY",
		"subtitle": "Spend Brood Research samples recovered in the field to unlock permanent biological adaptations.",
		"color": Color("#4ef28a"),
		"tiers": [
			{
				"points": 2,
				"choices": [
					{"id": "brood_t1_bunker", "name": "Chitin-Lined Bunkers", "glyph": "bunker_plus", "unit_id": "field_bunker", "desc": "Laminates Field Bunkers with harvested carapace plates for +150 hit points."},
					{"id": "brood_t1_shrike", "name": "Automated Roof Gun", "glyph": "heavy_cannon", "unit_id": "field_bunker", "desc": "Mounts an autonomous light repeater turret atop every Field Bunker."},
				],
			},
			{
				"points": 4,
				"choices": [
					{"id": "brood_t2_med", "name": "Enzymatic Trauma Packs", "glyph": "med_cross", "unit_id": "triage_specialist", "desc": "Triage Specialists heal 25% faster and cure corrosive spores."},
					{"id": "brood_t2_hull", "name": "Resilient Bio-Sealant", "glyph": "shield_hex", "unit_id": "rampart_transport", "desc": "Transports and vehicles slowly regenerate hull integrity out of combat."},
				],
			},
			{
				"points": 6,
				"choices": [
					{"id": "brood_t3_supply", "name": "Rapid Orbital Silos", "glyph": "drop_arrow", "unit_id": "silo", "desc": "Calls down Provision Silos from orbit in half the standard build time."},
					{"id": "brood_t3_cargo", "name": "Reinforced Troop Hold", "glyph": "exo_frame", "unit_id": "rampart_transport", "desc": "Increases Rampart cargo capacity by 50% and hull armor by +2."},
				],
			},
			{
				"points": 9,
				"choices": [
					{"id": "brood_t4_energy", "name": "Cellular Bio-Capacitors", "glyph": "battery_plus", "unit_id": "shade_agent", "desc": "Increases maximum energy of specialist units by +100."},
					{"id": "brood_t4_regen", "name": "Regenerative Bio-Steel", "glyph": "plasma_spark", "unit_id": "warden_walker", "desc": "All Meridian vehicles and starships regenerate 1.5 HP per second."},
				],
			},
			{
				"points": 12,
				"choices": [
					{"id": "brood_t5_disruptor", "name": "Synaptic Disruptor Tower", "glyph": "radar_pulse", "unit_id": "quarantine_relay", "desc": "Slows hostile Brood movement and attack speed near forward relays."},
					{"id": "brood_t5_nova", "name": "Neuro-Shock Emitter", "glyph": "concussive_wave", "unit_id": "colony_hub", "desc": "Temporarily stuns massed biological attackers breaching perimeter defenses."},
				],
			},
		],
	},
	"concord": {
		"title": "AURELIAN CONCORD RELICS",
		"subtitle": "Channel Concord relic resonance to upgrade Meridian Guard weapons, refineries, and power cores.",
		"color": Color("#63e6ff"),
		"tiers": [
			{
				"points": 2,
				"choices": [
					{"id": "concord_t1_cap", "name": "Ultra-Capacitors", "glyph": "rail_bolt", "unit_id": "rifleman", "desc": "Weapon upgrades grant +5% bonus attack speed to all combat units."},
					{"id": "concord_t1_vanadium", "name": "Vanadium Lattice", "glyph": "armor_plate", "unit_id": "breacher", "desc": "Armor upgrades grant +5% bonus maximum hit points to all units."},
				],
			},
			{
				"points": 4,
				"choices": [
					{"id": "concord_t2_aether", "name": "Micro-Filtered Taps", "glyph": "supply_crate", "unit_id": "aether_tap", "desc": "Aether Taps extract +25% more refined Aether per cycle."},
					{"id": "concord_t2_relay", "name": "Harmonic Sensor Net", "glyph": "range_scope", "unit_id": "radar_beacon", "desc": "Extends radar detection and structure sight range across the base."},
				],
			},
			{
				"points": 6,
				"choices": [
					{"id": "concord_t3_auto", "name": "Autonomous Aether Siphon", "glyph": "gear_bolt", "unit_id": "aether_tap", "desc": "Aether Taps harvest continuously without requiring Pioneer crews."},
					{"id": "concord_t3_twin", "name": "Dual-Core Hub Queue", "glyph": "exo_frame", "unit_id": "colony_hub", "desc": "Colony Hubs train two Pioneers in parallel from twin assembly bays."},
				],
			},
			{
				"points": 8,
				"choices": [
					{"id": "concord_t4_sentry", "name": "Lumen Sky Sentry", "glyph": "cloak_eye", "unit_id": "sky_sentry", "desc": "Equips Sky Sentries with permanent mobile detection and shield emitters."},
					{"id": "concord_t4_module", "name": "Unified Tech-Fabricator", "glyph": "plasma_spark", "unit_id": "research_module", "desc": "Combines Research and Fabrication attachments into a single high-output module."},
				],
			},
			{
				"points": 10,
				"choices": [
					{"id": "concord_t5_drop", "name": "Orbital Drop Beacons", "glyph": "drop_arrow", "unit_id": "muster_hall", "desc": "Newly trained infantry deploy directly to the Muster Hall rally point via drop-pod."},
					{"id": "concord_t5_matrix", "name": "Aegis Phase Matrix", "glyph": "shield_hex", "unit_id": "dreadnought", "desc": "Grants combat vehicles and starships a rechargeable 40-HP Concord energy barrier."},
				],
			},
		],
	},
}

const NEWS_HEADLINES := [
	["FRN BREAKING", "DIRECTORATE IMPOSES COMMS BLACKOUT OVER VESPER GATE; CAPTAIN VALE'S FLOTILLA SPOTTED IN ORBIT."],
	["VESPER LIBERATED", "VESPER GATE RELAY TOWER DESTROYED — COLONIAL RESISTANCE RALLIES TO MERIDIAN GUARD BANNER."],
	["WHITE RIDGE INCIDENT", "DIRECTORATE EXCAVATION OVERRUN AT WHITE RIDGE; ANCIENT CONCORD RELIC REPORTED MISSING."],
	["TWILIGHT EVACUATION", "PILOT SABLE EXTRACTS GARRISON FROM DAWN REACH AS GNARL BROOD SWARMS OVERRUN OUTER BRIDGES."],
	["BRACKEN CONVOY", "OVER FIFTY COLONIST TRANSPORTS SAFELY ESCORTED OFF-WORLD DESPITE HEAVY BROOD AMBUSHES."],
	["ASHFALL CLEARED", "QUARANTINE LIFTED OVER ASHFALL HAVEN FOLLOWING MULTI-DAY CONTAINMENT SWEEP."],
	["REDSTONE SURGE", "TECTONIC INSTABILITY PEAKS ON REDSTONE; MERIDIAN PROSPECTORS SECURE RECORD CRYSTAL HAUL."],
	["TALION EXPEDITION", "GUARD STRIKE FORCE RECOVERS SUNKEN TALION RELIC AHEAD OF ADVANCING BROOD BROOD-PACKS."],
	["SANCTUARY SAVED", "CONCORD PURIFIER VESSEL BROUGHT DOWN IN ORBIT — OUTER COLONY FLEETS DECLARE ALLIANCE."],
	["TARSUS RAIL CUT", "EIGHT ARMORED DIRECTORATE FREIGHT TRAINS INTERCEPTED ACROSS TARSUS DEPOT LINES."],
	["VERDANT REACH", "DR. ASTER CONFIRMS HIGH-PURITY AETHER CANISTERS SECURED FROM BEL'VERDANT JUNGLE VENTS."],
	["AURELIA VAULT OPEN", "HELIX LASER DRILL BREACHES ANCIENT SEAL ON AURELIA PRIME; FRONTIER STANDS UNITED."],
]

static func _load_config() -> ConfigFile:
	var config := ConfigFile.new()
	config.load(Campaign._progress_path())
	return config

static func format_credits(amount: int) -> String:
	var s := str(maxi(0, amount))
	var out := ""
	var count := 0
	for i in range(s.length() - 1, -1, -1):
		if count > 0 and count % 3 == 0:
			out = "," + out
		out = s[i] + out
		count += 1
	return out

static func mission_meta(index: int) -> Dictionary:
	return MISSION_META[clampi(index, 0, MISSION_META.size() - 1)]

static func purchased_techs() -> Array[String]:
	var config := _load_config()
	var result: Array[String] = []
	for item in config.get_value("hub_armory", "purchased", []):
		result.append(str(item))
	return result

static func hired_mercenaries() -> Array[String]:
	var config := _load_config()
	var result: Array[String] = ["merc_roadwardens"]
	for item in config.get_value("hub_cantina", "hired", []):
		var id := str(item)
		if id not in result:
			result.append(id)
	return result

static func selected_lab_perks() -> Dictionary:
	var config := _load_config()
	var stored = config.get_value("hub_lab", "perks", {})
	return stored.duplicate(true) if typeof(stored) == TYPE_DICTIONARY else {}

static func research_totals() -> Dictionary:
	var config := _load_config()
	var brood := 0
	var concord := 0
	if config.has_section("brood_research"):
		for key in config.get_section_keys("brood_research"):
			brood += int(config.get_value("brood_research", key, 0))
	if config.has_section("concord_research"):
		for key in config.get_section_keys("concord_research"):
			concord += int(config.get_value("concord_research", key, 0))
	# Grant 2 starter research points per completed frontier arc if none sampled yet so Lab is interactive
	var completed := Campaign.completed_missions()
	if brood == 0 and completed.size() >= 3:
		brood = mini(12, completed.size())
	if concord == 0 and completed.size() >= 2:
		concord = mini(10, completed.size())
	return {"brood": brood, "concord": concord}

static func credits_earned() -> int:
	var total := INITIAL_CREDITS
	var completed := Campaign.completed_missions()
	for index in Campaign.MISSIONS.size():
		if Campaign.MISSIONS[index].id in completed:
			total += int(MISSION_META[index].credits)
	return total

static func credits_spent() -> int:
	var spent := 0
	var bought := purchased_techs()
	for cat in ARMORY_CATEGORIES:
		for unit_entry in cat.units:
			for upg in unit_entry.upgrades:
				if upg.id in bought:
					spent += int(upg.cost)
	var hired := hired_mercenaries()
	for merc in MERCENARIES:
		if merc.id in hired:
			spent += int(merc.cost)
	return spent

static func credits_available() -> int:
	return maxi(0, credits_earned() - credits_spent())

static func find_tech(tech_id: String) -> Dictionary:
	for cat in ARMORY_CATEGORIES:
		for unit_entry in cat.units:
			for upg in unit_entry.upgrades:
				if upg.id == tech_id:
					return upg
	return {}

static func purchase_tech(tech_id: String) -> Dictionary:
	var upg := find_tech(tech_id)
	if upg.is_empty():
		return {"ok": false, "error": "Unknown upgrade."}
	var bought := purchased_techs()
	if tech_id in bought:
		return {"ok": false, "error": "Already purchased."}
	var avail := credits_available()
	var cost := int(upg.cost)
	if avail < cost:
		return {"ok": false, "error": "Insufficient credits."}
	bought.append(tech_id)
	var config := _load_config()
	config.set_value("hub_armory", "purchased", bought)
	var err := config.save(Campaign._progress_path())
	return {"ok": err == OK, "credits": credits_available()}

static func hire_mercenary(merc_id: String) -> Dictionary:
	var target := {}
	for merc in MERCENARIES:
		if merc.id == merc_id:
			target = merc
			break
	if target.is_empty():
		return {"ok": false, "error": "Unknown contract."}
	var hired := hired_mercenaries()
	if merc_id in hired:
		return {"ok": false, "error": "Contract already active."}
	var cost := int(target.cost)
	if credits_available() < cost:
		return {"ok": false, "error": "Insufficient credits."}
	var config := _load_config()
	var saved_hired: Array = config.get_value("hub_cantina", "hired", [])
	saved_hired.append(merc_id)
	config.set_value("hub_cantina", "hired", saved_hired)
	var err := config.save(Campaign._progress_path())
	return {"ok": err == OK, "credits": credits_available()}

static func select_lab_perk(track: String, tier_idx: int, perk_id: String) -> Dictionary:
	if not LAB_TRACKS.has(track):
		return {"ok": false, "error": "Unknown research track."}
	var tiers: Array = LAB_TRACKS[track].tiers
	if tier_idx < 0 or tier_idx >= tiers.size():
		return {"ok": false, "error": "Invalid research tier."}
	var tier: Dictionary = tiers[tier_idx]
	var totals := research_totals()
	if int(totals.get(track, 0)) < int(tier.points):
		return {"ok": false, "error": "Requires %d %s Research." % [tier.points, track.capitalize()]}
	var valid := false
	for choice in tier.choices:
		if choice.id == perk_id:
			valid = true
			break
	if not valid:
		return {"ok": false, "error": "Unknown research choice."}
	var perks := selected_lab_perks()
	var key := "%s_%d" % [track, tier_idx]
	perks[key] = perk_id
	var config := _load_config()
	config.set_value("hub_lab", "perks", perks)
	var err := config.save(Campaign._progress_path())
	return {"ok": err == OK, "selected": perks}

static func current_news_item() -> Array:
	var count := mini(Campaign.completed_missions().size(), NEWS_HEADLINES.size() - 1)
	return NEWS_HEADLINES[count]
