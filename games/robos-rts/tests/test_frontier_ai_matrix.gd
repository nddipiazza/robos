extends SceneTree

const FACTIONS := ["humans", "monsters", "aliens"]
const MATCH_LIMIT_SECONDS := 1200
const TECH_MILESTONES := ["workshop", "airframe_hangar", "hatchling_pool", "bile_warren", "blight_spire",
	"concord_core", "transit_waystone", "aegis_relay", "twilight_array", "aegis_capacitor",
	"prism_forge", "robotics_foundry", "robotics_annex", "mirage_adept", "mirage_shade",
	"canticle_archive", "storm_scribe", "veil_sanctum", "duskblade", "lattice_archon", "rupture_crawler",
	"spine_den", "infestation_pit", "adaptation_chamber", "ambusher_den", "spine_ambusher", "carapace_cavern", "carapace_bulwark",
	"spore_watch", "thorn_watch", "spore_seer", "drift_hauler", "corrosion_flyer", "brood_siege_flyer",
	"mireweaver", "locust_brooder", "tunnel_mouth", "brood_tunnel_worm", "siphon_wyrm", "brood_growth_node",
	"star_assembly", "fleet_spire", "dawn_interceptor", "prism_ray", "horizon_lancer", "fleet_carrier",
	"field_armory", "vehicle_armory", "specter_academy", "shade_agent", "cinder_runner", "cinder_guard",
	"sentinel_mine", "sentinel_mine_armed", "vortex_rover", "atlas_walker", "rampart_transport",
	"ignition_core", "night_harrier", "sky_sentry", "sky_sentry_defender"]
# Seed 31 reverses the first two start assignments from seed 3.
const MATCH_SEEDS := [3, 17, 31]

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim := root.get_node("SimEngine")
	sim.rts_mode = "backend"
	var pairs: Array = []
	for first in FACTIONS:
		for second in FACTIONS:
			pairs.append([first, second])
	pairs.append_array([["random", "humans"], ["aliens", "random"], ["random", "random"]])
	var first_case := 0
	var last_case := pairs.size() - 1
	var seeds := MATCH_SEEDS
	var time_limit := MATCH_LIMIT_SECONDS
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--first="):
			first_case = int(arg.trim_prefix("--first="))
		elif arg.begins_with("--last="):
			last_case = int(arg.trim_prefix("--last="))
		elif arg.begins_with("--seed="):
			seeds = [int(arg.trim_prefix("--seed="))]
		elif arg.begins_with("--limit="):
			time_limit = int(arg.trim_prefix("--limit="))
	if first_case < 0 or last_case >= pairs.size() or first_case > last_case or time_limit <= 0:
		printerr("Invalid case range or time limit.")
		quit(2)
		return
	var failed := false
	for index in range(first_case, last_case + 1):
		for seed_value in seeds:
			var result: Dictionary = sim.start_online_match("frontier-hunters", seed_value, pairs[index], true)
			if not result.ok:
				printerr(result.error)
				quit(1)
				return
			var milestones := {1: {}, 2: {}}
			var observed_recoveries := {}
			for second in range(time_limit):
				sim.step_ticks(sim.TICK_RATE)
				_sample_match(sim, milestones, observed_recoveries, second + 1)
				if sim.match_state.status == "finished":
					break
			var match_info: Dictionary = sim.match_state
			var economy := []
			for seat in [1, 2]:
				var player: Dictionary = sim.players[seat]
				economy.append({"trained": player.units_trained, "collected": player.crystal_collected, "kills": player.units_killed,
					"milestones": milestones[seat]})
				failed = failed or player.units_trained == 0 or player.crystal_collected == 0
				if match_info.status != "finished":
					var surviving := {}
					var stalled_routes := []
					var buildings := []
					for unit in sim.units.values():
						if unit.owner != seat:
							continue
						surviving[unit.unit_type] = int(surviving.get(unit.unit_type, 0)) + 1
						if unit.is_structure:
							buildings.append({"type": unit.unit_type, "position": str(unit.pos), "hp": int(unit.hp)})
						var route: Dictionary = unit.get("skirmish_route", {})
						if not route.is_empty() and stalled_routes.size() < 12:
							stalled_routes.append({"type": unit.unit_type, "position": str(unit.pos),
								"destination": str(route.get("destination")), "orders": unit.orders.size()})
					economy.back().merge({"surviving": surviving, "unspent_crystal": player.crystal,
						"unspent_aether": player.aether, "active_routes": stalled_routes, "buildings": buildings})
			failed = failed or match_info.status != "finished"
			print(JSON.stringify({"case": index, "seed": seed_value, "choices": pairs[index], "factions": match_info.factions,
				"starts": match_info.assigned_starts, "winner": match_info.winner, "reason": match_info.reason,
				"seconds": sim.sim_time, "economy": economy}))
	quit(1 if failed else 0)

func _sample_match(sim: Node, milestones: Dictionary, observed_recoveries: Dictionary, elapsed: int) -> void:
	for seat in milestones:
		var player: Dictionary = sim.players[seat]
		var timeline: Dictionary = milestones[seat]
		if elapsed == 20:
			timeline["opening_crystal"] = player.crystal_collected
		if player.aether_collected > 0 and not timeline.has("first_aether"):
			timeline["first_aether"] = elapsed
		if player.upgrades.get("burrow", 0) and not timeline.has("burrow_research"):
			timeline["burrow_research"] = elapsed
		for upgrade in ["tunneling_claws", "glial_reconstitution"]:
			if player.upgrades.get(upgrade, 0) and not timeline.has(upgrade):
				timeline[upgrade] = elapsed
	for unit in sim.units.values():
		if not milestones.has(unit.owner):
			continue
		var timeline: Dictionary = milestones[unit.owner]
		if unit.unit_type in TECH_MILESTONES and unit.build_progress >= 1.0 and not timeline.has(unit.unit_type):
			timeline[unit.unit_type] = elapsed
		if unit.get("burrowed", false) and not timeline.has("first_burrow"):
			timeline["first_burrow"] = elapsed
		if unit.has("structure_form") and not timeline.has(unit.structure_form):
			timeline[unit.structure_form] = elapsed
		var route: Dictionary = unit.get("skirmish_route", {})
		if route.get("recovery", false) and observed_recoveries.get(unit.tag) != route.check_tick:
			observed_recoveries[unit.tag] = route.check_tick
			timeline["route_recoveries"] = int(timeline.get("route_recoveries", 0)) + 1
