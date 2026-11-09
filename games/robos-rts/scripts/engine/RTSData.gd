extends Node

# RTSData.gd — Three-faction unit, structure and ability registry
# Factions:
# 1. HUMANS   ("humans" / Meridian Guard): Pioneer, Rifleman (Surge Injector), Breacher (Concussive Slow), Howitzer (Mobile/Emplaced Mode), Colony Hub, Provision Silo (Retract/Extend), Aether Tap, Muster Hall, Workshop
# 2. MONSTERS ("monsters" / Gnarl Brood): Forager, Skitterling (fast melee), Bile Crawler (armored acid), Blight Hurler (corrosive bile), Brood Nest
# 3. ALIENS   ("aliens" / Aurelian Concord): Mote, Sunblade (Aegis Shields + Charge), Skirmisher (Aegis Shields + Phase Step teleport!),Spire Walker (Prism Beam splash + Cliff-Walk), Heartstone, Resonator (Power Matrix +8 Supply), Waystone

const FACTION_HUMANS = "humans"
const FACTION_MONSTERS = "monsters"
const FACTION_ALIENS = "aliens"

var units: Dictionary = {
	# =========================================================================
	# 1. HUMANS (Meridian Guard)
	# =========================================================================
	"pioneer": {
		"id": "pioneer",
		"name": "Pioneer",
		"blurb": "Builds structures and gathers crystal and aether. Fragile; keep it out of fights.",
		"faction": FACTION_HUMANS,
		"is_structure": false,
		"is_worker": true,
		"attributes": ["Light", "Biological", "Mechanical"],
		"crystal_cost": 50,
		"aether_cost": 0,
		"supply_cost": 1,
		"build_time": 12.0,
		"max_hp": 45.0,
		"max_shields": 0.0,
		"armor": 0.0,
		"radius": 0.85,
		"speed": 7.0,
		"sight_range": 18.0,
		"push_priority": 1,
		"weapon": {
			"name": "Arc Welder",
			"sfx": "arc_welder",
			"attack_type": "melee",
			"damage": 5.0,
			"bonus": {},
			"attacks": 1,
			"range": 1.6,
			"period": 1.07,
			"damage_point": 0.12,
			"backswing": 0.25,
			"splash_radius": 0.0
		},
		"abilities": ["move", "stop", "hold_position", "attack", "harvest", "build_colony_hub", "build_silo", "build_aether_tap", "build_muster_hall", "build_workshop", "build_sentry_turret"],
		"dialogues": {
			"select": [
				{"id": "pioneer_select_1", "text": "What's up, Commander?"},
				{"id": "pioneer_select_2", "text": "Talk to me, boss. Welding rig's hot."},
				{"id": "pioneer_select_3", "text": "Pioneer here. Whatcha need built?"},
				{"id": "pioneer_select_4", "text": "Yeah? Clock's ticking, point me at a job."},
				{"id": "pioneer_select_5", "text": "Arc torch is charged and ready. What's the plan?"},
				{"id": "pioneer_select_6", "text": "Need something bolted together, or taken apart?"}
			],
			"move": [
				{"id": "pioneer_move_1", "text": "On my way."},
				{"id": "pioneer_move_2", "text": "You got it, chief."},
				{"id": "pioneer_move_3", "text": "Hauling gear over there now."},
				{"id": "pioneer_move_4", "text": "Copy that, rolling out."},
				{"id": "pioneer_move_5", "text": "Heading to the site."}
			],
			"job_done": [
				{"id": "pioneer_job_done_1", "text": "Job's done! Not a bad weld if I say so myself."},
				{"id": "pioneer_job_done_2", "text": "All finished up, boss. What's next?"},
				{"id": "pioneer_job_done_3", "text": "Structure's online and solid as bedrock."},
				{"id": "pioneer_job_done_4", "text": "Construction complete. That'll hold through an orbital drop."},
				{"id": "pioneer_job_done_5", "text": "Another masterpiece off the checklist."},
				{"id": "pioneer_job_done_6", "text": "Wrapped it up! Ready for the next blueprint."}
			],
			"attack": [
				{"id": "pioneer_attack_1", "text": "Guess this arc welder does overtime on hostiles!"},
				{"id": "pioneer_attack_2", "text": "Hold still, I'm gonna spot-weld your armor shut!"},
				{"id": "pioneer_attack_3", "text": "Nobody messes with the union! Eat plasma sparks!"},
				{"id": "pioneer_attack_4", "text": "This wasn't in my job description, but here we go!"},
				{"id": "pioneer_attack_5", "text": "Consider this an unscheduled demolition!"}
			]
		}
	},
	"rifleman": {
		"id": "rifleman",
		"name": "Rifleman",
		"blurb": "Cheap ranged infantry. Surge Injector trades 10 HP for faster movement and fire rate. Strong when kiting melee units.",
		"faction": FACTION_HUMANS,
		"is_structure": false,
		"is_worker": false,
		"attributes": ["Light", "Biological"],
		"crystal_cost": 50,
		"aether_cost": 0,
		"supply_cost": 1,
		"build_time": 18.0,
		"max_hp": 45.0,
		"max_shields": 0.0,
		"armor": 0.0,
		"radius": 0.85,
		"speed": 7.2,
		"sight_range": 22.0,
		"push_priority": 2,
		"weapon": {
			"name": "R-9 Carbine",
			"targets_air": true,
			"sfx": "rifle_fire",
			"attack_type": "ranged",
			"damage": 6.0,
			"bonus": {},
			"attacks": 1,
			"range": 12.5,
			"period": 0.61,
			"damage_point": 0.05,
			"backswing": 0.30,
			"splash_radius": 0.0
		},
		"abilities": ["move", "stop", "hold_position", "attack", "surge"],
		"dialogues": {
			"select": [
				{"id": "rifleman_select_1", "text": "Rifle squad standing by. Where's the trouble?"},
				{"id": "rifleman_select_2", "text": "Magazines full, safeties off. Give the word."},
				{"id": "rifleman_select_3", "text": "Meridian Guard reporting. What's up, Commander?"},
				{"id": "rifleman_select_4", "text": "Eyes sharp, rifle ready."},
				{"id": "rifleman_select_5", "text": "Just point us toward the target."}
			],
			"move": [
				{"id": "rifleman_move_1", "text": "Moving up, double time!"},
				{"id": "rifleman_move_2", "text": "Advancing to position."},
				{"id": "rifleman_move_3", "text": "Boots on the move, copy that."},
				{"id": "rifleman_move_4", "text": "Pushing forward!"},
				{"id": "rifleman_move_5", "text": "Solid copy, relocating now."}
			],
			"attack": [
				{"id": "rifleman_attack_1", "text": "Say hello to three-round burst diplomacy!"},
				{"id": "rifleman_attack_2", "text": "Free lead delivery, no signature required!"},
				{"id": "rifleman_attack_3", "text": "Keep your heads down, or don't, makes my job easier!"},
				{"id": "rifleman_attack_4", "text": "Target locked! Let's ventilate 'em!"},
				{"id": "rifleman_attack_5", "text": "Hope they brought an umbrella for this hailstorm!"}
			],
			"ready": [
				{"id": "rifleman_ready_1", "text": "Rifleman locked and loaded!"},
				{"id": "rifleman_ready_2", "text": "Fresh boots on the ground, Commander."}
			]
		}
	},
	"breacher": {
		"id": "breacher",
		"name": "Breacher",
		"blurb": "Armored line infantry. Breach Charges deal bonus damage to armored targets and slow them.",
		"faction": FACTION_HUMANS,
		"is_structure": false,
		"is_worker": false,
		"attributes": ["Armored", "Biological"],
		"crystal_cost": 100,
		"aether_cost": 25,
		"supply_cost": 2,
		"build_time": 21.0,
		"max_hp": 125.0,
		"max_shields": 0.0,
		"armor": 1.0,
		"radius": 1.25,
		"speed": 7.0,
		"sight_range": 24.0,
		"push_priority": 3,
		"weapon": {
			"name": "Breach Charges",
			"sfx": "breach_charge",
			"attack_type": "ranged",
			"damage": 10.0,
			"bonus": {"Armored": 10.0},
			"target_priority": {"Armored": 60.0},
			"attacks": 1,
			"range": 14.5,
			"period": 1.07,
			"damage_point": 0.12,
			"backswing": 0.32,
			"splash_radius": 0.0,
			"concussive_slow": 0.5
		},
		"abilities": ["move", "stop", "hold_position", "attack", "surge"],
		"dialogues": {
			"select": [
				{"id": "breacher_select_1", "text": "Breacher suit online. Point me at a wall, or a face."},
				{"id": "breacher_select_2", "text": "Heavy armor here. What needs smashing?"},
				{"id": "breacher_select_3", "text": "Concussion shells primed. What's the call?"},
				{"id": "breacher_select_4", "text": "You rang, Commander? Ready to crack some shells."},
				{"id": "breacher_select_5", "text": "Standing by with the big boomers."}
			],
			"move": [
				{"id": "breacher_move_1", "text": "Heavy boots rolling out."},
				{"id": "breacher_move_2", "text": "Stomping over there now."},
				{"id": "breacher_move_3", "text": "Clear the lane, Breacher moving!"},
				{"id": "breacher_move_4", "text": "Copy that, advancing."}
			],
			"attack": [
				{"id": "breacher_attack_1", "text": "Knock knock! I brought my own door!"},
				{"id": "breacher_attack_2", "text": "Let's slow their roll, permanently!"},
				{"id": "breacher_attack_3", "text": "Catch this concussion charge, ugly!"},
				{"id": "breacher_attack_4", "text": "Armor plating? Cute. Watch this!"},
				{"id": "breacher_attack_5", "text": "Time for a little high-velocity attitude adjustment!"}
			],
			"ready": [
				{"id": "breacher_ready_1", "text": "Breacher suited up and ready to wreck!"},
				{"id": "breacher_ready_2", "text": "Heavy shock trooper reporting for duty."}
			]
		}
	},
	"howitzer": {
		"id": "howitzer",
		"name": "Howitzer (Mobile Mode)",
		"blurb": "Mobile artillery. Emplace it to reach range 31 with splash damage.",
		"faction": FACTION_HUMANS,
		"is_structure": false,
		"is_worker": false,
		"attributes": ["Armored", "Mechanical"],
		"crystal_cost": 150,
		"aether_cost": 125,
		"supply_cost": 3,
		"build_time": 32.0,
		"max_hp": 175.0,
		"max_shields": 0.0,
		"armor": 1.0,
		"radius": 1.75,
		"speed": 5.8,
		"sight_range": 26.0,
		"push_priority": 4,
		"weapon": {
			"name": "Twin Autocannon",
			"sfx": "autocannon_fire",
			"attack_type": "ranged",
			"damage": 15.0,
			"bonus": {"Armored": 10.0},
			"attacks": 1,
			"range": 16.5,
			"period": 0.74,
			"damage_point": 0.08,
			"backswing": 0.25,
			"splash_radius": 0.0
		},
		"abilities": ["move", "stop", "hold_position", "attack", "emplace"],
		"dialogues": {
			"select": [
				{"id": "howitzer_select_1", "text": "Artillery crew online. Give us coordinates."},
				{"id": "howitzer_select_2", "text": "Howitzer standing by. Want it loud or extra loud?"},
				{"id": "howitzer_select_3", "text": "Ballistics computer ready. What's on the menu?"},
				{"id": "howitzer_select_4", "text": "One-fifty-five millimeter problem solver at your service."},
				{"id": "howitzer_select_5", "text": "Reading you five-by-five, Commander."}
			],
			"move": [
				{"id": "howitzer_move_1", "text": "Rolling the big gun into position."},
				{"id": "howitzer_move_2", "text": "Relocating artillery."},
				{"id": "howitzer_move_3", "text": "Adjusting firing vector."},
				{"id": "howitzer_move_4", "text": "On the move, Commander."}
			],
			"attack": [
				{"id": "howitzer_attack_1", "text": "Sending very warm regards from thirty meters away!"},
				{"id": "howitzer_attack_2", "text": "Forecast for their grid square: one hundred percent shrapnel!"},
				{"id": "howitzer_attack_3", "text": "Special delivery! Catch it with your teeth!"},
				{"id": "howitzer_attack_4", "text": "Deleting that coordinate in three, two, one!"},
				{"id": "howitzer_attack_5", "text": "Nothing personal, just high-explosive physics!"}
			],
			"ready": [
				{"id": "howitzer_ready_1", "text": "Howitzer crew rolled out and ready for fire missions!"},
				{"id": "howitzer_ready_2", "text": "Siege artillery online, Commander."}
			]
		}
	},
	"howitzer_emplaced": {
		"id": "howitzer_emplaced",
		"name": "Howitzer (Emplaced Mode)",
		"blurb": "Deployed artillery. Range 31, minimum range 5. Splash deals half damage to allies. Cannot move until mobilized.",
		"faction": FACTION_HUMANS,
		"is_structure": false,
		"is_worker": false,
		"is_immobile": true,
		"attributes": ["Armored", "Mechanical"],
		"crystal_cost": 150,
		"aether_cost": 125,
		"supply_cost": 3,
		"build_time": 32.0,
		"max_hp": 175.0,
		"max_shields": 0.0,
		"armor": 1.0,
		"radius": 1.85,
		"speed": 0.0,
		"sight_range": 30.0,
		"push_priority": 10,
		"weapon": {
			"name": "Emplaced Mortar",
			"sfx": "mortar_fire",
			"impact_sfx": "explosion_splash",
			"attack_type": "ranged",
			"damage": 40.0,
			"bonus": {"Armored": 30.0},
			"attacks": 1,
			"range": 31.0,
			"min_range": 5.0,
			"period": 2.14,
			"damage_point": 0.35,
			"backswing": 0.30,
			"splash_radius": 3.5,
			"friendly_splash": 0.5
		},
		"abilities": ["stop", "attack", "mobilize"],
		"dialogues": {
			"select": [
				{"id": "howitzer_select_1", "text": "Artillery crew online. Give us coordinates."},
				{"id": "howitzer_select_2", "text": "Howitzer standing by. Want it loud or extra loud?"},
				{"id": "howitzer_select_3", "text": "Ballistics computer ready. What's on the menu?"},
				{"id": "howitzer_select_4", "text": "One-fifty-five millimeter problem solver at your service."},
				{"id": "howitzer_select_5", "text": "Reading you five-by-five, Commander."}
			],
			"attack": [
				{"id": "howitzer_attack_1", "text": "Sending very warm regards from thirty meters away!"},
				{"id": "howitzer_attack_2", "text": "Forecast for their grid square: one hundred percent shrapnel!"},
				{"id": "howitzer_attack_3", "text": "Special delivery! Catch it with your teeth!"},
				{"id": "howitzer_attack_4", "text": "Deleting that coordinate in three, two, one!"},
				{"id": "howitzer_attack_5", "text": "Nothing personal, just high-explosive physics!"}
			]
		}
	},
	"colony_hub": {
		"id": "colony_hub",
		"name": "Colony Hub",
		"blurb": "Main base. Trains Pioneers, receives gathered resources and provides 15 supply.",
		"faction": FACTION_HUMANS,
		"is_structure": true,
		"is_town_hall": true,
		"attributes": ["Armored", "Mechanical", "Structure"],
		"crystal_cost": 400,
		"aether_cost": 0,
		"supply_provided": 15,
		"build_time": 71.0,
		"max_hp": 1500.0,
		"max_shields": 0.0,
		"armor": 1.0,
		"radius": 4.2,
		"footprint": Vector2i(5, 5),
		"sight_range": 26.0,
		"push_priority": 100,
		"trains": ["pioneer"],
		"abilities": ["train_pioneer", "rally", "recon_sweep", "reinforce_supply"]
	},
	"silo": {
		"id": "silo",
		"name": "Provision Silo",
		"blurb": "Provides 8 supply. Extended, it blocks the path; retract it to let units through.",
		"faction": FACTION_HUMANS,
		"is_structure": true,
		"attributes": ["Armored", "Mechanical", "Structure"],
		"crystal_cost": 100,
		"aether_cost": 0,
		"supply_provided": 8,
		"build_time": 21.0,
		"max_hp": 400.0,
		"max_shields": 0.0,
		"armor": 1.0,
		"radius": 1.8,
		"footprint": Vector2i(2, 2),
		"sight_range": 18.0,
		"push_priority": 100,
		"abilities": ["retract_silo", "salvage"]
	},
	"silo_retracted": {
		"id": "silo_retracted",
		"name": "Provision Silo (Retracted)",
		"blurb": "Provides 8 supply. Retracted into the ground, so units can walk over it.",
		"faction": FACTION_HUMANS,
		"is_structure": true,
		"is_walkable_structure": true,
		"attributes": ["Armored", "Mechanical", "Structure"],
		"crystal_cost": 100,
		"aether_cost": 0,
		"supply_provided": 8,
		"build_time": 21.0,
		"max_hp": 400.0,
		"max_shields": 0.0,
		"armor": 1.0,
		"radius": 1.8,
		"footprint": Vector2i(2, 2),
		"sight_range": 18.0,
		"push_priority": 0,
		"abilities": ["extend_silo", "salvage"]
	},
	"aether_tap": {
		"id": "aether_tap",
		"is_extractor": true,
		"name": "Aether Tap",
		"blurb": "Extracts aether from a vent. Pioneers carry it back to the Colony Hub.",
		"faction": FACTION_HUMANS,
		"is_structure": true,
		"is_gas_extractor": true,
		"attributes": ["Armored", "Mechanical", "Structure"],
		"crystal_cost": 75,
		"aether_cost": 0,
		"supply_provided": 0,
		"build_time": 21.0,
		"max_hp": 500.0,
		"max_shields": 0.0,
		"armor": 1.0,
		"radius": 2.6,
		"footprint": Vector2i(3, 3),
		"sight_range": 18.0,
		"push_priority": 100,
		"abilities": []
	},
	"triage_specialist": {
		"id": "triage_specialist", "name": "Triage Specialist", "faction": FACTION_HUMANS,
		"blurb": "Heals nearby biological allies with energy. Right-click a wounded ally to follow and treat them.",
		"attributes": ["Light", "Biological"],
		"crystal_cost": 75, "aether_cost": 25, "supply_cost": 2, "build_time": 22.0,
		"max_hp": 60.0, "armor": 1.0, "radius": 0.85, "speed": 7.2, "sight_range": 22.0,
		"support": {"stat": "hp", "range": 5.0, "rate": 14.0, "max_energy": 75.0, "starting_energy": 45.0, "regen": 1.0, "ability": "restore_vitals"},
		"abilities": ["move", "stop", "hold_position", "restore_vitals"],
		"dialogues": {
			"select": [
				{"id": "triage_specialist_select_1", "text": "Triage ready."},
				{"id": "triage_specialist_select_2", "text": "Who needs a patch?"},
				{"id": "triage_specialist_select_3", "text": "I've got clean hands and a full kit."},
				{"id": "triage_specialist_select_4", "text": "Keep the wounded close."},
				{"id": "triage_specialist_select_5", "text": "You're on my rounds."}
			],
			"move": [
				{"id": "triage_specialist_move_1", "text": "On my way."},
				{"id": "triage_specialist_move_2", "text": "Moving the aid kit."},
				{"id": "triage_specialist_move_3", "text": "Keep a lane open."},
				{"id": "triage_specialist_move_4", "text": "I'll take the short route."}
			],
			"support": [
				{"id": "triage_specialist_support_1", "text": "Hold still. This one's cold."},
				{"id": "triage_specialist_support_2", "text": "Save the war story for later."},
				{"id": "triage_specialist_support_3", "text": "Patch in place. Keep breathing."},
				{"id": "triage_specialist_support_4", "text": "You'll live to file the report."},
				{"id": "triage_specialist_support_5", "text": "Back on your feet, soldier."}
			],
			"ready": [
				{"id": "triage_specialist_ready_1", "text": "Triage kit stocked."},
				{"id": "triage_specialist_ready_2", "text": "Your field specialist is ready."}
			],
		}
	},
	"muster_hall": {
		"id": "muster_hall",
		"name": "Muster Hall",
		"blurb": "Trains Riflemen, Breachers and Triage Specialists. Requires a Provision Silo.",
		"faction": FACTION_HUMANS,
		"is_structure": true,
		"requires": ["silo"],
		"attributes": ["Armored", "Mechanical", "Structure"],
		"crystal_cost": 150,
		"aether_cost": 0,
		"supply_provided": 0,
		"build_time": 46.0,
		"max_hp": 1000.0,
		"max_shields": 0.0,
		"armor": 1.0,
		"radius": 2.8,
		"footprint": Vector2i(3, 3),
		"sight_range": 20.0,
		"push_priority": 100,
		"trains": ["rifleman", "breacher", "triage_specialist"],
		"abilities": ["train_rifleman", "train_breacher", "rally", "train_triage_specialist"]
	},
	"kestrel_interceptor": {
		"id": "kestrel_interceptor", "name": "Kestrel Interceptor", "faction": FACTION_HUMANS,
		"blurb": "Fast air superiority craft. Flies across ground obstacles and fires at aircraft.",
		"attributes": ["Armored", "Mechanical", "Air"],
		"crystal_cost": 125, "aether_cost": 100, "supply_cost": 3, "build_time": 30.0,
		"max_hp": 125.0, "armor": 1.0, "radius": 1.25, "speed": 12.0, "sight_range": 28.0, "flight_height": 7.0,
		"weapon": {
			"name": "Seeker Burst", "sfx": "autocannon_fire", "attack_type": "ranged",
			"damage": 20.0, "range": 14.0, "period": 1.1, "damage_point": 0.12, "backswing": 0.28,
			"targets_air": true, "targets_ground": false
		},
		"abilities": ["move", "stop", "hold_position", "attack"],
		"dialogues": {
			"select": [
				{"id": "kestrel_interceptor_select_1", "text": "Kestrel on station."},
				{"id": "kestrel_interceptor_select_2", "text": "Sky looks clear from here."},
				{"id": "kestrel_interceptor_select_3", "text": "Flight lead listening."},
				{"id": "kestrel_interceptor_select_4", "text": "You have my wings."},
				{"id": "kestrel_interceptor_select_5", "text": "Pick a heading."}
			],
			"move": [
				{"id": "kestrel_interceptor_move_1", "text": "Banking over."},
				{"id": "kestrel_interceptor_move_2", "text": "Vector received."},
				{"id": "kestrel_interceptor_move_3", "text": "Taking the high route."},
				{"id": "kestrel_interceptor_move_4", "text": "Crossing now."}
			],
			"attack": [
				{"id": "kestrel_interceptor_attack_1", "text": "That bird's coming down."},
				{"id": "kestrel_interceptor_attack_2", "text": "Lock is solid."},
				{"id": "kestrel_interceptor_attack_3", "text": "Keep the sky clean."},
				{"id": "kestrel_interceptor_attack_4", "text": "You've got company up here."},
				{"id": "kestrel_interceptor_attack_5", "text": "Missile away. Mind the debris."}
			],
			"ready": [
				{"id": "kestrel_interceptor_ready_1", "text": "Kestrel airborne."},
				{"id": "kestrel_interceptor_ready_2", "text": "Engines green. Ready to intercept."}
			],
		}
	},
	"workshop": {
		"id": "workshop",
		"name": "Workshop",
		"blurb": "Builds Howitzers and Kestrel Interceptors and researches weapon and armor upgrades. Requires a Muster Hall.",
		"faction": FACTION_HUMANS,
		"is_structure": true,
		"requires": ["muster_hall"],
		"attributes": ["Armored", "Mechanical", "Structure"],
		"crystal_cost": 150,
		"aether_cost": 100,
		"supply_provided": 0,
		"build_time": 43.0,
		"max_hp": 1250.0,
		"max_shields": 0.0,
		"armor": 1.0,
		"radius": 3.0,
		"footprint": Vector2i(3, 3),
		"sight_range": 20.0,
		"push_priority": 100,
		"trains": ["howitzer", "kestrel_interceptor"],
		"abilities": ["train_howitzer", "rally", "research_weapons", "research_armor", "train_kestrel_interceptor"]
	},
	"sentry_turret": {
		"id": "sentry_turret",
		"name": "Sentry Turret",
		"blurb": "Automated defensive cannon that reveals cloaked enemies in its sensor range. Requires a Muster Hall.",
		"faction": FACTION_HUMANS,
		"is_structure": true,
		"is_immobile": true,
		"requires": ["muster_hall"],
		"attributes": ["Armored", "Mechanical", "Structure", "Detector"],
		"crystal_cost": 125,
		"aether_cost": 0,
		"build_time": 28.0,
		"max_hp": 350.0,
		"armor": 1.0,
		"radius": 1.65,
		"footprint": Vector2i(2, 2),
		"sight_range": 17.0,
		"detection_radius": 14.0,
		"weapon": {
			"name": "Sentry Coilgun", "sfx": "sentry_fire", "attack_type": "ranged",
			"targets_air": true,
			"damage": 12.0, "range": 13.0, "period": 0.9,
			"damage_point": 0.09, "backswing": 0.2, "attacks": 1
		},
		"abilities": ["attack", "stop"]
	},

	# =========================================================================
	# 2. MONSTERS (Gnarl Brood — Fast Organic Melee & Acid Pack)
	# =========================================================================
	"forager": {
		"id": "forager",
		"name": "Forager",
		"blurb": "Worker. Gathers crystal and returns it to the Brood Nest.",
		"faction": FACTION_MONSTERS,
		"is_structure": false,
		"is_worker": true,
		"attributes": ["Light", "Biological"],
		"crystal_cost": 50,
		"aether_cost": 0,
		"supply_cost": 1,
		"build_time": 12.0,
		"max_hp": 40.0,
		"max_shields": 0.0,
		"armor": 0.0,
		"radius": 0.85,
		"speed": 7.0,
		"sight_range": 18.0,
		"push_priority": 1,
		"weapon": {
			"name": "Mandibles",
			"damage": 5.0,
			"bonus": {},
			"attacks": 1,
			"range": 1.6,
			"period": 1.07,
			"damage_point": 0.12,
			"backswing": 0.25,
			"splash_radius": 0.0,
			"sfx": "mandible_bite",
			"attack_type": "melee"
		},
		"abilities": ["move", "stop", "hold_position", "attack", "harvest", "build_brood_nest", "build_brood_pod", "build_spore_tap"],
		"dialogues": {
			"select": [
				{"id": "forager_select_1", "text": "The brood hears."},
				{"id": "forager_select_2", "text": "Claws at your service."},
				{"id": "forager_select_3", "text": "What shall grow here?"},
				{"id": "forager_select_4", "text": "Point me to the vein."},
				{"id": "forager_select_5", "text": "Always hungry. Always working."},
			],
			"move": [
				{"id": "forager_move_1", "text": "Scuttling there."},
				{"id": "forager_move_2", "text": "I smell a seam."},
				{"id": "forager_move_3", "text": "Claws in motion."},
				{"id": "forager_move_4", "text": "The tunnels call."},
			],
			"attack": [
				{"id": "forager_attack_1", "text": "I bite harder than I look."},
				{"id": "forager_attack_2", "text": "A brief interruption for lunch."},
				{"id": "forager_attack_3", "text": "Those teeth are not for show."},
				{"id": "forager_attack_4", "text": "Try chewing back."},
				{"id": "forager_attack_5", "text": "I'll take a small sample."},
			],
			"job_done": [
				{"id": "forager_job_done_1", "text": "The brood has taken root."},
				{"id": "forager_job_done_2", "text": "Our new growth is ready."},
				{"id": "forager_job_done_3", "text": "The shell has hardened."},
				{"id": "forager_job_done_4", "text": "A new pulse in the colony."},
				{"id": "forager_job_done_5", "text": "One more place to call ours."},
			],
			"ready": [
				{"id": "forager_ready_1", "text": "Fresh claws for the brood."},
				{"id": "forager_ready_2", "text": "Hatched and hungry."},
			],
		}
	},
	"skitterling": {
		"id": "skitterling",
		"name": "Skitterling",
		"blurb": "Very fast, cheap melee swarm unit. Dangerous in numbers, weak to splash damage.",
		"faction": FACTION_MONSTERS,
		"is_structure": false,
		"is_worker": false,
		"attributes": ["Light", "Biological"],
		"crystal_cost": 25,
		"aether_cost": 0,
		"supply_cost": 1,
		"build_time": 17.0,
		"max_hp": 35.0,
		"max_shields": 0.0,
		"armor": 0.0,
		"radius": 0.72,
		"speed": 9.8,
		"sight_range": 20.0,
		"push_priority": 2,
		"weapon": {
			"name": "Razor Claws",
			"damage": 5.0,
			"bonus": {},
			"attacks": 1,
			"range": 1.9,
			"period": 0.49,
			"damage_point": 0.08,
			"backswing": 0.20,
			"splash_radius": 0.0,
			"sfx": "claw_slash",
			"attack_type": "melee"
		},
		"abilities": ["move", "stop", "hold_position", "attack"]
	},
	"bile_crawler": {
		"id": "bile_crawler",
		"name": "Bile Crawler",
		"blurb": "Armored acid spitter with mid range. Good against structures and armored units.",
		"faction": FACTION_MONSTERS,
		"is_structure": false,
		"is_worker": false,
		"attributes": ["Armored", "Biological"],
		"crystal_cost": 75,
		"aether_cost": 25,
		"supply_cost": 2,
		"build_time": 19.0,
		"max_hp": 145.0,
		"max_shields": 0.0,
		"armor": 1.0,
		"radius": 1.15,
		"speed": 7.0,
		"sight_range": 22.0,
		"push_priority": 3,
		"weapon": {
			"name": "Caustic Spit",
			"damage": 16.0,
			"bonus": {},
			"attacks": 1,
			"range": 10.5,
			"period": 1.43,
			"damage_point": 0.12,
			"backswing": 0.30,
			"splash_radius": 0.0,
			"sfx": "acid_spit",
			"targets_air": true,
			"attack_type": "ranged"
		},
		"abilities": ["move", "stop", "hold_position", "attack"]
	},
	"blight_hurler": {
		"id": "blight_hurler",
		"name": "Blight Hurler",
		"blurb": "Lobs corrosive blight that splashes. Bonus damage to structures.",
		"faction": FACTION_MONSTERS,
		"is_structure": false,
		"is_worker": false,
		"attributes": ["Biological"],
		"crystal_cost": 100,
		"aether_cost": 100,
		"supply_cost": 3,
		"build_time": 24.0,
		"max_hp": 120.0,
		"max_shields": 0.0,
		"armor": 1.0,
		"radius": 1.45,
		"speed": 7.2,
		"sight_range": 24.0,
		"push_priority": 4,
		"weapon": {
			"name": "Corrosive Lob",
			"damage": 18.0,
			"bonus": {"Structure": 8.0},
			"target_priority": {"Structure": 220.0},
			"attacks": 1,
			"range": 15.0,
			"period": 1.14,
			"damage_point": 0.10,
			"backswing": 0.28,
			"splash_radius": 2.0,
			"sfx": "corrosive_lob",
			"impact_sfx": "explosion_splash",
			"attack_type": "ranged"
		},
		"abilities": ["move", "stop", "hold_position", "attack"]
	},
	"brood_nest": {
		"id": "brood_nest",
		"name": "Brood Nest",
		"blurb": "Monster main base. Spawns Foragers, Skitterlings, Bile Crawlers and Blight Hurlers.",
		"faction": FACTION_MONSTERS,
		"is_structure": true,
		"is_town_hall": true,
		"attributes": ["Armored", "Biological", "Structure"],
		"crystal_cost": 300,
		"aether_cost": 0,
		"supply_provided": 15,
		"build_time": 71.0,
		"max_hp": 1500.0,
		"max_shields": 0.0,
		"armor": 1.0,
		"radius": 4.2,
		"footprint": Vector2i(5, 5),
		"sight_range": 26.0,
		"push_priority": 100,
		"trains": ["forager", "skitterling", "bile_crawler", "blight_hurler"],
		"abilities": ["train_forager", "train_skitterling", "train_bile_crawler", "train_blight_hurler", "rally", "rally_worker"]
	},
	"brood_pod": {
		"id": "brood_pod", "name": "Brood Pod", "faction": FACTION_MONSTERS,
		"blurb": "A Forager grows into a Brood Pod. Provides 8 supply.",
		"is_structure": true, "attributes": ["Armored", "Biological", "Structure"],
		"crystal_cost": 75, "aether_cost": 0, "supply_provided": 8,
		"build_time": 19.0, "max_hp": 400.0, "radius": 1.8, "sight_range": 16.0,
		"footprint": Vector2i(2, 2), "push_priority": 100, "abilities": []
	},
	"spore_tap": {
		"id": "spore_tap", "name": "Spore Tap", "faction": FACTION_MONSTERS,
		"blurb": "A Forager grows into a Spore Tap on an aether vent. Three Foragers can harvest there efficiently.",
		"is_structure": true, "is_extractor": true, "attributes": ["Armored", "Biological", "Structure"],
		"crystal_cost": 50, "aether_cost": 0, "build_time": 21.0,
		"max_hp": 500.0, "armor": 1.0, "radius": 2.0, "sight_range": 16.0,
		"footprint": Vector2i(2, 2), "push_priority": 100, "abilities": []
	},

	# =========================================================================
	# 3. ALIENS (Aurelian Concord — Regenerating Aegis Shields, Phase Step & Thermal Spire Walker)
	# =========================================================================
	"mote": {
		"id": "mote",
		"name": "Mote",
		"blurb": "Worker. Gathers crystal and summons structures that complete on their own.",
		"faction": FACTION_ALIENS,
		"is_structure": false,
		"is_worker": true,
		"attributes": ["Light", "Mechanical"],
		"crystal_cost": 50,
		"aether_cost": 0,
		"supply_cost": 1,
		"build_time": 12.0,
		"max_hp": 20.0,
		"max_shields": 20.0,
		"armor": 0.0,
		"radius": 0.85,
		"speed": 7.2,
		"sight_range": 18.0,
		"push_priority": 1,
		"weapon": {
			"name": "Mote Spark",
			"damage": 5.0,
			"bonus": {},
			"attacks": 1,
			"range": 1.8,
			"period": 1.07,
			"damage_point": 0.10,
			"backswing": 0.22,
			"splash_radius": 0.0,
			"sfx": "mote_spark",
			"attack_type": "melee"
		},
		"abilities": ["move", "stop", "hold_position", "attack", "harvest", "build_heartstone", "build_resonator", "build_waystone", "build_aether_prism", "build_aegis_relay"],
		"dialogues": {
			"select": [
				{"id": "mote_select_1", "text": "Signal received."},
				{"id": "mote_select_2", "text": "Mote ready to align."},
				{"id": "mote_select_3", "text": "Awaiting coordinates."},
				{"id": "mote_select_4", "text": "All harmonics stable."},
				{"id": "mote_select_5", "text": "The Concord is listening."},
			],
			"move": [
				{"id": "mote_move_1", "text": "Drifting into position."},
				{"id": "mote_move_2", "text": "Following the signal."},
				{"id": "mote_move_3", "text": "Course adjusted."},
				{"id": "mote_move_4", "text": "On the next harmonic."},
			],
			"attack": [
				{"id": "mote_attack_1", "text": "I am rated for light demolition."},
				{"id": "mote_attack_2", "text": "Consider this a small correction."},
				{"id": "mote_attack_3", "text": "Your warranty has expired."},
				{"id": "mote_attack_4", "text": "Applying a pointed disagreement."},
				{"id": "mote_attack_5", "text": "An unexpected use of my toolkit."},
			],
			"job_done": [
				{"id": "mote_job_done_1", "text": "The structure is aligned."},
				{"id": "mote_job_done_2", "text": "Summoning complete."},
				{"id": "mote_job_done_3", "text": "The pattern has stabilized."},
				{"id": "mote_job_done_4", "text": "The lattice is ready."},
				{"id": "mote_job_done_5", "text": "The Concord's reach extends."},
			],
			"ready": [
				{"id": "mote_ready_1", "text": "Mote signal online."},
				{"id": "mote_ready_2", "text": "I have joined the lattice."},
			],
		}
	},
	"sunblade": {
		"id": "sunblade",
		"name": "Sunblade",
		"blurb": "Shielded melee warrior with twin light blades. Rush closes the gap quickly.",
		"faction": FACTION_ALIENS,
		"is_structure": false,
		"is_worker": false,
		"attributes": ["Light", "Biological"],
		"crystal_cost": 100,
		"aether_cost": 0,
		"supply_cost": 2,
		"build_time": 27.0,
		"max_hp": 100.0,
		"max_shields": 50.0,
		"armor": 1.0,
		"radius": 1.0,
		"speed": 7.6,
		"sight_range": 22.0,
		"push_priority": 3,
		"weapon": {
			"name": "Light Blades",
			"damage": 16.0,
			"bonus": {},
			"attacks": 2,
			"range": 2.1,
			"period": 0.86,
			"damage_point": 0.08,
			"backswing": 0.25,
			"splash_radius": 0.0,
			"sfx": "light_blade_strike",
			"attack_type": "melee"
		},
		"abilities": ["move", "stop", "hold_position", "attack", "charge"]
	},
	"skirmisher": {
		"id": "skirmisher",
		"name": "Skirmisher",
		"blurb": "Shielded ranged unit. Phase Step teleports it out of danger or onto high ground.",
		"faction": FACTION_ALIENS,
		"is_structure": false,
		"is_worker": false,
		"attributes": ["Armored", "Mechanical"],
		"crystal_cost": 125,
		"aether_cost": 50,
		"supply_cost": 2,
		"build_time": 30.0,
		"max_hp": 80.0,
		"max_shields": 80.0,
		"armor": 1.0,
		"radius": 1.25,
		"speed": 8.4,
		"sight_range": 26.0,
		"push_priority": 3,
		"weapon": {
			"name": "Lattice Needlers",
			"targets_air": true,
			"damage": 13.0,
			"bonus": {"Armored": 5.0},
			"attacks": 1,
			"range": 15.5,
			"period": 1.34,
			"damage_point": 0.09,
			"backswing": 0.26,
			"splash_radius": 0.0,
			"sfx": "needler_fire",
			"attack_type": "ranged"
		},
		"abilities": ["move", "stop", "hold_position", "attack", "phase_step", "phase_cloak"]
	},
	"spire_walker": {
		"id": "spire_walker",
		"name": "Spire Walker",
		"blurb": "Towering walker with splash prism beams. Strong against light units and can step over cliff walls.",
		"faction": FACTION_ALIENS,
		"is_structure": false,
		"is_worker": false,
		"attributes": ["Armored", "Mechanical", "Massive"],
		"crystal_cost": 300,
		"aether_cost": 200,
		"supply_cost": 6,
		"build_time": 54.0,
		"max_hp": 200.0,
		"max_shields": 150.0,
		"armor": 1.0,
		"radius": 2.0,
		"speed": 6.4,
		"sight_range": 28.0,
		"push_priority": 6,
		"weapon": {
			"name": "Prism Beams",
			"damage": 20.0,
			"bonus": {"Light": 10.0},
			"attacks": 2,
			"range": 21.0,
			"period": 1.07,
			"damage_point": 0.10,
			"backswing": 0.25,
			"splash_radius": 2.8,
			"sfx": "prism_beam",
			"impact_sfx": "explosion_splash",
			"attack_type": "ranged"
		},
		"abilities": ["move", "stop", "hold_position", "attack"]
	},
	"heartstone": {
		"id": "heartstone",
		"name": "Heartstone",
		"blurb": "Aurelian main base. Summons Motes and provides 15 supply.",
		"faction": FACTION_ALIENS,
		"is_structure": true,
		"is_town_hall": true,
		"attributes": ["Armored", "Structure"],
		"crystal_cost": 400,
		"aether_cost": 0,
		"supply_provided": 15,
		"build_time": 71.0,
		"max_hp": 1000.0,
		"max_shields": 1000.0,
		"armor": 1.0,
		"radius": 4.2,
		"footprint": Vector2i(5, 5),
		"sight_range": 26.0,
		"push_priority": 100,
		"trains": ["mote"],
		"abilities": ["train_mote", "rally"]
	},
	"resonator": {
		"id": "resonator",
		"name": "Resonator",
		"blurb": "Provides 8 supply and powers nearby Waystones and Aegis Relays.",
		"faction": FACTION_ALIENS,
		"is_structure": true,
		"attributes": ["Armored", "Structure"],
		"crystal_cost": 100,
		"aether_cost": 0,
		"supply_provided": 8,
		"build_time": 18.0,
		"max_hp": 200.0,
		"max_shields": 200.0,
		"armor": 0.0,
		"radius": 1.8,
		"footprint": Vector2i(2, 2),
		"sight_range": 18.0,
		"push_priority": 100,
		"abilities": []
	},
	"waystone": {
		"id": "waystone",
		"name": "Waystone",
		"blurb": "Summons Sunblades, Skirmishers and Spire Walkers. Requires a Resonator's power field in skirmish.",
		"faction": FACTION_ALIENS,
		"is_structure": true,
		"attributes": ["Armored", "Structure"],
		"crystal_cost": 150,
		"aether_cost": 0,
		"supply_provided": 0,
		"build_time": 46.0,
		"max_hp": 500.0,
		"max_shields": 500.0,
		"armor": 1.0,
		"radius": 2.8,
		"footprint": Vector2i(3, 3),
		"sight_range": 20.0,
		"push_priority": 100,
		"trains": ["sunblade", "skirmisher", "spire_walker"],
		"abilities": ["train_sunblade", "train_skirmisher", "train_spire_walker", "rally"]
	},
	"aegis_relay": {
		"id": "aegis_relay", "name": "Aegis Relay", "faction": FACTION_ALIENS,
		"blurb": "A powered relay spends energy to restore nearby allied shields, even during combat.",
		"is_structure": true, "attributes": ["Armored", "Structure"],
		"crystal_cost": 100, "aether_cost": 0, "build_time": 26.0,
		"max_hp": 150.0, "max_shields": 150.0, "armor": 1.0, "radius": 1.8,
		"footprint": Vector2i(2, 2), "sight_range": 15.0, "push_priority": 100,
		"support": {"stat": "shields", "range": 7.0, "rate": 22.0, "max_energy": 100.0, "starting_energy": 50.0, "regen": 1.0, "ability": "restore_aegis"},
		"abilities": []
	},
	"aether_prism": {
		"id": "aether_prism", "name": "Aether Prism", "faction": FACTION_ALIENS,
		"blurb": "Summoned on an aether vent. Three Motes can harvest there efficiently.",
		"is_structure": true, "is_extractor": true, "attributes": ["Armored", "Structure"],
		"crystal_cost": 75, "aether_cost": 0, "build_time": 21.0,
		"max_hp": 250.0, "max_shields": 250.0, "armor": 1.0, "radius": 2.0, "sight_range": 16.0,
		"footprint": Vector2i(2, 2), "push_priority": 100, "abilities": []
	},
	"shale_barrier": {
		"id": "shale_barrier", "name": "Shale Barrier", "faction": "neutral",
		"blurb": "Attack the barrier to open a route.",
		"is_structure": true, "is_immobile": true, "attributes": ["Armored", "Structure"],
		"max_hp": 300.0, "armor": 2.0, "radius": 5.0, "sight_range": 0.0
	}
}

var abilities: Dictionary = {
	"move": {"id": "move", "name": "Move", "hotkey": "M", "target": "point", "desc": "Move to a location. Units do not stop for enemies on the way."},
	"stop": {"id": "stop", "name": "Stop", "hotkey": "S", "target": "none", "desc": "Cancel the current order. Hold Shift to queue the stop."},
	"hold_position": {"id": "hold_position", "name": "Hold Position", "hotkey": "H", "target": "none", "desc": "Stay in place and only fire at enemies in range. Hold Shift to queue."},
	"attack": {"id": "attack", "name": "Attack", "hotkey": "A", "target": "point_or_unit", "desc": "Attack-move to a point, engaging anything met on the way, or focus a single target."},
	"patrol": {"id": "patrol", "name": "Patrol", "hotkey": "P", "target": "point", "desc": "Travel back and forth, engaging visible enemies along the route."},
	"harvest": {"id": "harvest", "name": "Gather", "hotkey": "G", "target": "resource", "desc": "Gather crystal or aether and return it to the nearest main base."},
	"return_cargo": {"id": "return_cargo", "name": "Return Cargo", "hotkey": "D", "target": "none", "desc": "Deliver carried resources to a completed main base. Workers already gathering resume that assignment after delivery."},
	"repair": {"id": "repair", "name": "Repair", "hotkey": "E", "target": "unit", "desc": "Repair a friendly mechanical unit or building. Crystal cost scales with the health restored."},
	"restore_vitals": {"id": "restore_vitals", "name": "Treat Wounds", "hotkey": "E", "target": "unit", "desc": "Follow and heal a wounded biological ally. Each point restored spends one energy. Idle specialists heal nearby allies automatically.", "sfx": "vital_restore"},
	"restore_aegis": {"id": "restore_aegis", "name": "Restore Shields", "target": "none", "sfx": "aegis_restore"},
	"auto_repair": {"id": "auto_repair", "name": "Auto-Repair", "hotkey": "Q", "target": "none", "desc": "Toggle repairs for idle Pioneers. They spend crystal to repair nearby friendly machinery. Manual orders take priority."},
	"recon_sweep": {"id": "recon_sweep", "name": "Recon Sweep", "hotkey": "E", "target": "point", "desc": "Spend 50 Hub energy to reveal an area, including high ground, for 10 seconds."},
	"reinforce_supply": {"id": "reinforce_supply", "name": "Reinforce Supply", "hotkey": "D", "target": "unit", "desc": "Spend 50 Hub energy to add 8 supply to a completed friendly Provision Silo once."},
	"salvage": {"id": "salvage", "name": "Salvage Silo", "hotkey": "V", "target": "none", "desc": "Recover 75% of this completed Silo's cost after 5 seconds. Damage interrupts salvage. Press again to cancel."},
	"cancel_construction": {"id": "cancel_construction", "name": "Cancel Construction", "hotkey": "X", "target": "none", "desc": "Remove the foundation and refund 75% of the paid construction costs."},
	"surge": {"id": "surge", "name": "Surge Injector", "hotkey": "T", "target": "none", "desc": "Spend 10 HP for +50% movement and attack speed for 11 seconds.", "hp_cost": 10.0, "duration": 11.0, "speed_mult": 1.5, "attack_speed_mult": 1.5, "sfx": "surge_activate"},
	"phase_step": {"id": "phase_step", "name": "Phase Step", "hotkey": "B", "target": "point", "desc": "Teleport up to 18 range. 7 second cooldown.", "max_range": 18.0, "cooldown": 7.0, "sfx": "phase_step"},
	"phase_cloak": {"id": "phase_cloak", "name": "Phase Cloak", "hotkey": "C", "target": "none", "desc": "Spend 25 energy to cloak. Cloak drains 4 energy per second. Detectors and recon sweeps can reveal this unit.", "sfx": "phase_step"},
	"hold_fire": {"id": "hold_fire", "name": "Hold Fire", "hotkey": "K", "target": "none", "desc": "Toggle automatic attacks. Explicit attack orders can still fire."},
	"charge": {"id": "charge", "name": "Sunblade Rush", "hotkey": "C", "target": "none", "desc": "Burst of +80% movement speed for 3.5 seconds.", "duration": 3.5, "sfx": "charge_activate"},
	"emplace": {"id": "emplace", "name": "Emplace", "hotkey": "E", "target": "none", "desc": "Deploy. Range 31, minimum range 5. Splash deals half damage to allies. Cannot move while emplaced.", "morph_to": "howitzer_emplaced", "sfx": "siege_transform"},
	"mobilize": {"id": "mobilize", "name": "Mobilize", "hotkey": "D", "target": "none", "desc": "Pack up so the howitzer can move again.", "morph_to": "howitzer", "sfx": "siege_transform"},
	"retract_silo": {"id": "retract_silo", "name": "Retract Silo", "hotkey": "R", "target": "none", "desc": "Lower into the ground so units can walk over it.", "morph_to": "silo_retracted", "sfx": "silo_gate"},
	"extend_silo": {"id": "extend_silo", "name": "Extend Silo", "hotkey": "R", "target": "none", "desc": "Raise the silo again to block the path.", "morph_to": "silo", "sfx": "silo_gate"},
	"train_pioneer": {"id": "train_pioneer", "name": "Train Pioneer", "hotkey": "S", "target": "none", "unit": "pioneer"},
	"train_rifleman": {"id": "train_rifleman", "name": "Train Rifleman", "hotkey": "A", "target": "none", "unit": "rifleman"},
	"train_breacher": {"id": "train_breacher", "name": "Train Breacher", "hotkey": "D", "target": "none", "unit": "breacher"},
	"train_triage_specialist": {"id": "train_triage_specialist", "name": "Train Triage Specialist", "hotkey": "E", "target": "none", "unit": "triage_specialist"},
	"train_howitzer": {"id": "train_howitzer", "name": "Train Howitzer", "hotkey": "S", "target": "none", "unit": "howitzer"},
	"train_kestrel_interceptor": {"id": "train_kestrel_interceptor", "name": "Train Kestrel Interceptor", "hotkey": "A", "target": "none", "unit": "kestrel_interceptor"},
	"research_weapons": {"id": "research_weapons", "name": "Research Weapons", "hotkey": "W", "target": "none", "upgrade": "weapons", "desc": "Each level adds one damage per hit to Meridian Guard combat units. Applies to units already in the field."},
	"research_armor": {"id": "research_armor", "name": "Research Armor", "hotkey": "G", "target": "none", "upgrade": "armor", "desc": "Each level adds one armor to Meridian Guard combat units. Applies to units already in the field."},
	"train_forager": {"id": "train_forager", "name": "Spawn Forager", "hotkey": "D", "target": "none", "unit": "forager"},
	"train_skitterling": {"id": "train_skitterling", "name": "Spawn Skitterling", "hotkey": "Z", "target": "none", "unit": "skitterling"},
	"train_bile_crawler": {"id": "train_bile_crawler", "name": "Spawn Bile Crawler", "hotkey": "R", "target": "none", "unit": "bile_crawler"},
	"train_blight_hurler": {"id": "train_blight_hurler", "name": "Spawn Blight Hurler", "hotkey": "V", "target": "none", "unit": "blight_hurler"},
	"train_mote": {"id": "train_mote", "name": "Summon Mote", "hotkey": "E", "target": "none", "unit": "mote"},
	"train_sunblade": {"id": "train_sunblade", "name": "Summon Sunblade", "hotkey": "Z", "target": "none", "unit": "sunblade"},
	"train_skirmisher": {"id": "train_skirmisher", "name": "Summon Skirmisher", "hotkey": "S", "target": "none", "unit": "skirmisher"},
	"train_spire_walker": {"id": "train_spire_walker", "name": "Summon Spire Walker", "hotkey": "C", "target": "none", "unit": "spire_walker"},
	"build_silo": {"id": "build_silo", "name": "Build Provision Silo", "hotkey": "B", "target": "point", "structure": "silo"},
	"build_aether_tap": {"id": "build_aether_tap", "name": "Build Aether Tap", "hotkey": "R", "target": "point", "structure": "aether_tap"},
	"build_muster_hall": {"id": "build_muster_hall", "name": "Build Muster Hall", "hotkey": "X", "target": "point", "structure": "muster_hall"},
	"build_workshop": {"id": "build_workshop", "name": "Build Workshop", "hotkey": "F", "target": "point", "structure": "workshop"},
	"build_sentry_turret": {"id": "build_sentry_turret", "name": "Build Sentry Turret", "hotkey": "T", "target": "point", "structure": "sentry_turret"},
	"build_colony_hub": {"id": "build_colony_hub", "name": "Build Colony Hub", "hotkey": "C", "target": "point", "structure": "colony_hub"},
	"build_heartstone": {"id": "build_heartstone", "name": "Summon Heartstone", "hotkey": "N", "target": "point", "structure": "heartstone"},
	"build_resonator": {"id": "build_resonator", "name": "Summon Resonator", "hotkey": "E", "target": "point", "structure": "resonator"},
	"build_waystone": {"id": "build_waystone", "name": "Summon Waystone", "hotkey": "W", "target": "point", "structure": "waystone"},
	"build_aegis_relay": {"id": "build_aegis_relay", "name": "Summon Aegis Relay", "hotkey": "C", "target": "point", "structure": "aegis_relay"},
	"build_aether_prism": {"id": "build_aether_prism", "name": "Summon Aether Prism", "hotkey": "R", "target": "point", "structure": "aether_prism"},
	"build_brood_nest": {"id": "build_brood_nest", "name": "Grow Brood Nest", "hotkey": "N", "target": "point", "structure": "brood_nest"},
	"build_brood_pod": {"id": "build_brood_pod", "name": "Grow Brood Pod", "hotkey": "B", "target": "point", "structure": "brood_pod"},
	"build_spore_tap": {"id": "build_spore_tap", "name": "Grow Spore Tap", "hotkey": "R", "target": "point", "structure": "spore_tap"},
	"rally_worker": {"id": "rally_worker", "name": "Set Forager Rally", "hotkey": "G", "target": "point", "desc": "Route newly hatched Foragers without changing the army rally. Shift-click adds a waypoint."},
	"rally": {"id": "rally", "name": "Set Rally Point", "hotkey": "Y", "target": "point", "desc": "Set where new units move, follow or gather. Shift-click to add a waypoint."}
}

var faction_info: Dictionary = {
	"humans": {"name": "Meridian Guard", "color": Color("#4f8cf0"), "town_hall": "colony_hub", "worker": "pioneer", "extractor": "aether_tap"},
	"monsters": {"name": "Gnarl Brood", "color": Color("#e0453a"), "town_hall": "brood_nest", "worker": "forager", "extractor": "spore_tap"},
	"aliens": {"name": "Aurelian Concord", "color": Color("#f0c43c"), "town_hall": "heartstone", "worker": "mote", "extractor": "aether_prism"}
}

var player_colors: Dictionary = {
	1: Color("#4f8cf0"),
	2: Color("#e0453a"),
	3: Color("#f0c43c")
}

func get_faction_name(faction_id: String) -> String:
	return str(faction_info.get(faction_id, {}).get("name", faction_id.capitalize()))

func get_player_color(owner_id: int) -> Color:
	return player_colors.get(owner_id, Color("#9ca3af"))

func get_unit_def(unit_type: String) -> Dictionary:
	return units.get(unit_type.to_lower(), {})

func get_ability_def(ability_id: String) -> Dictionary:
	return abilities.get(ability_id.to_lower(), {})

func get_unit_dialogues(unit_type: String, category: String) -> Array:
	var u_def: Dictionary = get_unit_def(unit_type)
	var dlgs: Dictionary = u_def.get("dialogues", {})
	return dlgs.get(category.to_lower(), [])
