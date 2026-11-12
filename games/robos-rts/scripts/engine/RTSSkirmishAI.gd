extends RefCounted

const LadderRules = preload("res://scripts/engine/RTSLadderRules.gd")
const ROUTE_CHECK_TICKS := 3 * 64
const ROUTE_CHECK_DISTANCE_SQUARED := 2.25
const MAX_RECOVERIES_PER_UPDATE := 4
const RECOVERY_WORKER_TARGET := 4
const MINERAL_WORKERS_BEFORE_GAS := 3
const WORKER_SCOUT_START_TICKS := 40 * 64
const WORKER_SCOUT_DURATION_TICKS := 90 * 64
const WORKERS_BEFORE_SCOUT := 12
const DEFENSE_RADIUS := 28.0
const DEFENDER_CALL_DISTANCE := 36.0
const AIR_DEFENSE_RADIUS := 40.0
const AIR_DEFENDER_CALL_DISTANCE := 60.0
const MAX_DEFENDERS := 4
const MIN_SPLIT_ARMY := 8
const FRONT_SPACING := 24.0
const MAX_FRONT_PROBES := 6
const AIR_EVIDENCE_TICKS := 210 * 64
const STEALTH_EVIDENCE_TICKS := 75 * 64
const RECON_RETRY_TICKS := 75 * 64
const LADDER_TECH_SECONDS := 180.0
const LADDER_BROOD_GAS_SECONDS := 50.0
const AIR_COUNTERS := {"humans": "kestrel_interceptor", "monsters": "bile_crawler", "aliens": "skirmisher"}
const DETECTORS := {"humans": "sentry_turret", "monsters": "spore_watch", "aliens": "aegis_relay"}

# Macro decisions use the same paid commands as the player. Difficulty changes
# cadence, worker targets and army size, never damage, income or starting assets.
func step_player(pid: int, cfg: Dictionary) -> void:
	if _continue_defense_intercept(pid, cfg):
		return
	var defense_only := SimEngine.tick < int(cfg.get("next_tick", 0))
	if defense_only and SimEngine.tick < int(cfg.get("defense_recheck_tick", 2147483647)):
		return
	cfg.erase("defense_recheck_tick")
	var difficulty = str(cfg.get("difficulty", "normal"))
	var cadence = {"easy": 256, "normal": 128, "hard": 64}[difficulty]
	if not defense_only:
		cfg["next_tick"] = SimEngine.tick + cadence
	var strategy = str(cfg.get("strategy", "balanced"))
	var tech_transition := SimEngine.ladder_rules and SimEngine.sim_time >= LADDER_TECH_SECONDS
	var p: Dictionary = SimEngine.players.get(pid, {})
	var roster: Dictionary = RTSData.faction_info.get(p.get("faction", ""), {})
	if roster.is_empty():
		return
	var mine: Array = []
	var workers: Array = []
	var army: Array = []
	var halls: Array = []
	var counts: Dictionary = {}
	for u in SimEngine.units.values():
		if u.owner != pid:
			continue
		mine.append(u)
		counts[u.unit_type] = int(counts.get(u.unit_type, 0)) + 1
		if u.is_worker:
			if u.unit_type != "prospector":
				workers.append(u)
		elif not u.is_structure and not u.get("nonblocking", false) and not u.has("transit_finish") \
				and (not SimEngine.ladder_rules or u.unit_type not in ["drift_sac", "drift_hauler", "spore_seer", "seer_cocoon", "hauler_cocoon",
					"farsight_wisp", "lumen_carrier", "locust_flying", "locust_landed", "pursuit_fighter"]):
			army.append(u)
		if u.unit_type == roster.town_hall or u.unit_type == "fortified_hub":
			halls.append(u)
	_step_defense(pid, cfg, army, halls)
	if defense_only:
		return
	if SimEngine.ladder_rules and p.faction == RTSData.FACTION_MONSTERS and p.upgrades.get("burrow", 0):
		for crawler in army:
			if crawler.unit_type == "bile_crawler" and _try_crawler_burrow(pid, crawler):
				break
	if SimEngine.ladder_rules and p.faction == RTSData.FACTION_MONSTERS:
		for soldier in army:
			if soldier.unit_type == "spine_ambusher" and _try_spine_ambush(pid, soldier):
				break
	if halls.is_empty():
		_attack(pid, army, cfg, true)
		return
	if workers.size() < RECOVERY_WORKER_TARGET:
		_train_recovery_workers(halls, roster.worker, workers.size())
	var base: Vector2 = halls[0].pos
	var scout_tag := _step_worker_scout(pid, cfg, workers, base)
	# Include pending construction orders to avoid repeatedly replacing builders.
	var available_workers := workers.size() - (1 if scout_tag != 0 else 0)
	for worker in workers:
		if not worker.orders.is_empty() and worker.orders[0].type == "build":
			available_workers -= 1
		for order in worker.orders:
			if order.type == "build" and int(order.get("structure_tag", 0)) == 0:
				counts[order.structure_type] = int(counts.get(order.structure_type, 0)) + 1
	var response := _counter_orders(pid, cfg, p.faction, mine, halls, counts)
	var gas_taps := []
	for u in mine:
		if u.unit_type == roster.extractor and u.build_progress >= 1.0 and (SimEngine.unlimited_resources or not SimEngine.worker_rally_resource(pid, u.tag).is_empty()):
			if not SimEngine.ladder_rules:
				gas_taps.clear()
			gas_taps.append(u)
	var gas_slots := mini(3 * gas_taps.size(), maxi(0, available_workers - MINERAL_WORKERS_BEFORE_GAS))
	var gas_workers := {}
	for tap in gas_taps:
		for slot in range(mini(3, gas_slots)):
			var miner := _next_gas_worker(workers, tap, scout_tag, gas_workers)
			if miner.is_empty():
				break
			gas_workers[miner.tag] = true
			gas_slots -= 1
			if miner.orders.is_empty() or miner.harvest_target_tag != tap.tag:
				RTSCommanderAI.issue_order([miner.tag], "harvest", Vector2.ZERO, tap.tag)
	for worker in workers:
		if worker.tag == scout_tag or gas_workers.has(worker.tag) or (not worker.orders.is_empty() and worker.orders[0].type == "build"):
			continue
		var target: Dictionary = SimEngine.units.get(worker.harvest_target_tag, {})
		if worker.orders.is_empty() or (worker.orders[0].type == "harvest" and target.get("unit_type") == roster.extractor):
			RTSCommanderAI.harvest(worker)
	if tech_transition and workers.size() >= 18 and p.aether < 150 and int(counts.get(roster.extractor, 0)) <= gas_taps.size():
		_build(workers, roster.extractor, base)
	if p.faction != RTSData.FACTION_HUMANS:
		_step_asymmetric_macro(pid, cfg, mine, workers, army, halls, counts, response)
		return
	var pending_supply = int(counts.get("silo", 0)) + int(counts.get("silo_retracted", 0))
	var finished_supply = 0
	for u in mine:
		if u.unit_type in ["silo", "silo_retracted"] and u.build_progress >= 1:
			finished_supply += 1
	var needs_muster_hall := int(counts.get("muster_hall", 0)) == 0
	var needs_supply: bool = p.supply_cap < 200 and p.supply_cap - p.supply_used <= 4 and pending_supply == finished_supply
	if needs_supply or (needs_muster_hall and pending_supply == 0):
		_build(workers, "silo", base)
		return
	if needs_muster_hall:
		_build(workers, "muster_hall", base)
		return
	var air_needed: int = response.air
	if not response.detector.is_empty():
		if SimEngine.ladder_rules and not SimEngine.has_tech_structure(pid, "field_armory"):
			if int(counts.get("field_armory", 0)) == 0:
				_build(workers, "field_armory", base)
		else:
			_build(workers, response.detector, response.detector_site)
	if (strategy != "rush" or air_needed > 0 or tech_transition) and int(counts.get("aether_tap", 0)) == 0:
		_build(workers, "aether_tap", base)
		return
	# Reserve the expansion cost instead of spending every income tick on units.
	var total_bases: int = counts.get("colony_hub", 0) + counts.get("fortified_hub", 0)
	var planned_expansion := (strategy == "economy" or tech_transition) and total_bases < 2 and workers.size() >= 18 and SimEngine.sim_time >= 90
	var depleted := not SimEngine.unlimited_resources and workers.size() >= 12 and total_bases == halls.size() and _needs_new_mineral_line(halls)
	var expansion_reserve := 0
	if planned_expansion or depleted:
		var expansion = _expansion_position(pid, base)
		if expansion != Vector2.ZERO:
			_build(workers, "colony_hub", expansion, true)
			expansion_reserve = int(RTSData.get_unit_def("colony_hub").crystal_cost)
			if p.crystal < expansion_reserve + int(RTSData.get_unit_def("rifleman").crystal_cost):
				_attack(pid, army, cfg, false)
				return
	if (strategy == "siege" or air_needed > 0 or tech_transition) and int(counts.get("workshop", 0)) == 0:
		_build(workers, "workshop", base)
		# Keep paying for infantry while waiting for the technology requirement.
	elif int(counts.get("airframe_hangar", 0)) == 0 and (air_needed > 0
			or (SimEngine.ladder_rules and tech_transition and army.size() >= 12 and p.crystal - expansion_reserve >= 325 and p.aether >= 200)):
		_build(workers, "airframe_hangar", base)
	var academy_ready := SimEngine.ladder_rules and SimEngine.has_tech_structure(pid, "specter_academy")
	var armory_ready := SimEngine.ladder_rules and SimEngine.has_tech_structure(pid, "vehicle_armory")
	var agents := int(counts.get("shade_agent", 0))
	if SimEngine.ladder_rules and tech_transition and int(counts.get("field_armory", 0)) == 0 \
			and army.size() >= 10 and p.crystal - expansion_reserve >= 250 and p.aether >= 125:
		_build(workers, "field_armory", base)
	if SimEngine.ladder_rules and tech_transition and int(counts.get("specter_academy", 0)) == 0 \
			and army.size() >= 14 and p.crystal - expansion_reserve >= 350 and p.aether >= 275:
		_build(workers, "specter_academy", base)
	if SimEngine.ladder_rules and tech_transition and int(counts.get("vehicle_armory", 0)) == 0 \
			and int(counts.get("workshop", 0)) > 0 and p.crystal - expansion_reserve >= 450 and p.aether >= 250:
		_build(workers, "vehicle_armory", base)
	if SimEngine.ladder_rules and tech_transition and int(counts.get("ignition_core", 0)) == 0 \
			and SimEngine.has_tech_structure(pid, "airframe_hangar") and p.crystal - expansion_reserve >= 575 and p.aether >= 425:
		_build(workers, "ignition_core", base)
	var production_target = 3 if difficulty == "hard" or strategy == "rush" else 2
	if strategy == "siege":
		production_target = 1
	if int(counts.get("muster_hall", 0)) < production_target and p.crystal >= 150:
		_build(workers, "muster_hall", base)
	var worker_target = {"easy": 14, "normal": 20, "hard": 24}[difficulty]
	if strategy == "economy":
		worker_target += 8
	if SimEngine.ladder_rules:
		_try_hub_operations(pid, halls, workers.size(), p, response, expansion_reserve)
	for hall in halls:
		if workers.size() < worker_target and hall.production_queue.is_empty() and p.crystal - expansion_reserve >= int(RTSData.get_unit_def("pioneer").crystal_cost):
			RTSCommanderAI.issue_order([hall.tag], "train_pioneer")
	var has_ridge_scout: bool = int(counts.get("ridge_scout", 0)) > 0 or mine.any(func(producer):
		return producer.is_structure and producer.production_queue.any(func(job): return job.get("unit_type") == "ridge_scout"))
	for u in mine:
		if not u.is_structure or u.build_progress < 1.0 or not u.production_queue.is_empty():
			continue
		if SimEngine.ladder_rules and tech_transition and u.unit_type == "research_module":
			_try_module_research(u, p, counts, expansion_reserve)
		elif u.unit_type == "airframe_hangar":
			if air_needed > 0 and p.crystal - expansion_reserve >= int(RTSData.get_unit_def("kestrel_interceptor").crystal_cost):
				if RTSCommanderAI.issue_order([u.tag], "train_kestrel_interceptor").ok:
					air_needed -= 1
			elif SimEngine.ladder_rules and tech_transition:
				_try_airframe_mix(u, p, counts, response, expansion_reserve)
		elif u.unit_type == "ignition_core" and p.crystal - expansion_reserve >= 325 and p.aether >= 275:
			if not p.upgrades.get("dreadnought_refit", 0) and int(counts.get("dreadnought", 0)) > 0:
				RTSCommanderAI.issue_order([u.tag], "research_dreadnought_refit")
			elif not p.upgrades.get("sky_ballistics", 0) and int(counts.get("sky_sentry", 0)) + int(counts.get("sky_sentry_defender", 0)) > 0:
				RTSCommanderAI.issue_order([u.tag], "research_sky_ballistics")
			elif not p.upgrades.get("rampart_reactor", 0) and int(counts.get("rampart_transport", 0)) >= 2:
				RTSCommanderAI.issue_order([u.tag], "research_rampart_reactor")
		elif u.unit_type == "specter_academy" and agents >= 1:
			if not p.upgrades.get("agent_cloak", 0) and p.crystal - expansion_reserve >= 300 and p.aether >= 275:
				RTSCommanderAI.issue_order([u.tag], "research_agent_cloak")
			elif not u.get("tactical_charge_ready", false) and p.crystal - expansion_reserve >= 450 and p.aether >= 350:
				RTSCommanderAI.issue_order([u.tag], "train_tactical_charge")
		elif SimEngine.ladder_rules and u.unit_type in ["field_armory", "vehicle_armory"] and p.crystal - expansion_reserve >= 300 and p.aether >= 175:
			_try_meridian_group_research(u, p, air_needed)
		elif u.unit_type == "workshop" and (air_needed == 0 or (tech_transition and p.aether >= 225)):
			if SimEngine.ladder_rules and SimEngine.production_attachment(u, false).is_empty() and p.crystal >= 225 and p.aether >= 125:
				RTSCommanderAI.issue_order([u.tag], "attach_research_module")
				continue
			if SimEngine.ladder_rules and tech_transition and _try_workshop_mix(u, p, counts, response, armory_ready, expansion_reserve):
				continue
			if not SimEngine.ladder_rules and tech_transition and p.aether >= 100 and p.crystal - expansion_reserve >= 175 and int(counts.get("howitzer", 0)) + int(counts.get("howitzer_emplaced", 0)) >= 2:
				var upgrade := "research_weapons" if int(p.upgrades.weapons) <= int(p.upgrades.armor) else "research_armor"
				if RTSCommanderAI.issue_order([u.tag], upgrade).ok:
					continue
			if p.crystal - expansion_reserve >= int(RTSData.get_unit_def("howitzer").crystal_cost):
				RTSCommanderAI.issue_order([u.tag], "train_howitzer")
		elif u.unit_type == "muster_hall":
			if SimEngine.ladder_rules and tech_transition and army.size() >= 8 and p.crystal >= 225 and p.aether >= 125 \
					and SimEngine.production_attachment(u, false).is_empty():
				if RTSCommanderAI.issue_order([u.tag], "attach_research_module").ok:
					continue
			if academy_ready and agents < 2 and p.crystal - expansion_reserve >= 225 and p.aether >= 200 \
					and SimEngine.training_block_reason(u, "shade_agent").is_empty():
				if RTSCommanderAI.issue_order([u.tag], "train_shade_agent").ok:
					agents += 1
					continue
			if tech_transition and not has_ridge_scout and army.size() >= 6 and p.aether >= 100 and p.crystal - expansion_reserve >= int(RTSData.get_unit_def("ridge_scout").crystal_cost):
				if RTSCommanderAI.issue_order([u.tag], "train_ridge_scout").ok:
					has_ridge_scout = true
					continue
			# Siege reserves gas for the Workshop and its Howitzers.
			var unit_type = "breacher" if air_needed == 0 and strategy in ["economy", "balanced"] and army.size() % 3 == 2 and p.aether >= 25 else "rifleman"
			if p.crystal - expansion_reserve >= int(RTSData.get_unit_def(unit_type).crystal_cost):
				RTSCommanderAI.issue_order([u.tag], "train_" + unit_type)
	_attack(pid, army, cfg, false)

func _try_hub_operations(pid: int, halls: Array, workers: int, player: Dictionary, response: Dictionary, reserve: int) -> void:
	var started := halls.any(func(hall):
		return hall.get("hub_operations", false) or hall.production_queue.any(func(job): return job.get("upgrade") == "hub_operations"))
	if not started and workers >= 16 and player.crystal - reserve >= 275:
		for hall in halls:
			if hall.production_queue.is_empty() and SimEngine.hub_upgrade_block_reason(hall).is_empty():
				if RTSCommanderAI.issue_order([hall.tag], "upgrade_hub").ok:
					break
	var defense_hall: int = response.get("ground_defense_hall", 0)
	if started and defense_hall != 0 and halls.size() > 1 and workers >= 22 and player.crystal - reserve >= 400 and player.aether >= 325:
		var hall: Dictionary = SimEngine.units.get(defense_hall, {})
		if not hall.is_empty() and hall.production_queue.is_empty() and SimEngine.hub_upgrade_block_reason(hall, "fortify_hub").is_empty():
			RTSCommanderAI.issue_order([hall.tag], "fortify_hub")
	for hall in halls:
		if not SimEngine.can_use_hub_power(hall):
			continue
		if response.detection_alert and hall.energy < 100.0:
			continue
		var deposit := SimEngine.default_worker_deposit(hall)
		if not deposit.is_empty() and SimEngine.can_see_position(pid, deposit.pos):
			RTSCommanderAI.issue_order([hall.tag], "deploy_prospector", deposit.pos, deposit.tag)

func _try_airframe_mix(hangar: Dictionary, player: Dictionary, counts: Dictionary, response: Dictionary, reserve: int) -> void:
	var crystal := int(player.crystal) - reserve
	var aether := int(player.aether)
	var infantry: int = counts.get("rifleman", 0) + counts.get("breacher", 0)
	if infantry >= 8 and counts.get("rampart_transport", 0) < 2 and crystal >= 200 and aether >= 160:
		if RTSCommanderAI.issue_order([hangar.tag], "train_rampart_transport").ok:
			return
	if counts.get("sky_sentry", 0) + counts.get("sky_sentry_defender", 0) < 2 and crystal >= 325 and aether >= 250:
		if RTSCommanderAI.issue_order([hangar.tag], "train_sky_sentry").ok:
			return
	if crystal < 350 or aether < 250:
		return
	if SimEngine.production_attachment(hangar, false).is_empty():
		RTSCommanderAI.issue_order([hangar.tag], "attach_research_module")
	elif counts.get("dreadnought", 0) < 2 and crystal >= 650 and aether >= 425 \
			and SimEngine.has_tech_structure(hangar.owner, "ignition_core"):
		RTSCommanderAI.issue_order([hangar.tag], "train_dreadnought")
	elif counts.get("watchkeeper", 0) < 2 and (response.detection_alert or response.ranged or aether >= 375):
		RTSCommanderAI.issue_order([hangar.tag], "train_watchkeeper")
	elif counts.get("night_harrier", 0) < 2 and SimEngine.training_block_reason(hangar, "night_harrier").is_empty():
		RTSCommanderAI.issue_order([hangar.tag], "train_night_harrier")

func _try_module_research(module: Dictionary, player: Dictionary, counts: Dictionary, reserve: int) -> void:
	var producers := {
		"stim_injectors": int(counts.get("rifleman", 0)) + int(counts.get("breacher", 0)) >= 8,
		"combat_shields": int(counts.get("rifleman", 0)) >= 6,
		"concussive_shells": int(counts.get("breacher", 0)) >= 3,
		"infernal_catalyst": int(counts.get("cinder_runner", 0)) + int(counts.get("cinder_guard", 0)) >= 2,
		"drilling_claws": int(counts.get("sentinel_mine", 0)) + int(counts.get("sentinel_mine_armed", 0)) >= 2,
		"mag_accelerator": int(counts.get("vortex_rover", 0)) >= 2,
		"smart_servos": int(counts.get("atlas_walker", 0)) + int(counts.get("kestrel_interceptor", 0)) >= 3,
		"systems_jamming": int(counts.get("watchkeeper", 0)) >= 1,
		"harrier_cloaking": int(counts.get("night_harrier", 0)) >= 1,
		"harrier_rotors": int(counts.get("night_harrier", 0)) >= 2,
	}
	for ability in SimEngine.research_module_abilities(module):
		var upgrade := str(RTSData.get_ability_def(ability).upgrade)
		if not producers.get(upgrade, false) or not SimEngine.research_block_reason(module.owner, upgrade).is_empty():
			continue
		var offer := SimEngine.research_offer(module.owner, upgrade)
		if player.crystal - reserve >= int(offer.crystal) + 175 and player.aether >= int(offer.aether) + 75:
			if RTSCommanderAI.issue_order([module.tag], ability).ok:
				return

func _try_meridian_group_research(producer: Dictionary, player: Dictionary, air_needed: int) -> void:
	var choices := ["infantry_weapons", "infantry_armor"] if producer.unit_type == "field_armory" else [
		"ship_weapons" if air_needed > 0 else "vehicle_weapons", "vehicle_plating"]
	if int(player.upgrades.get(choices[0], 0)) > int(player.upgrades.get(choices[1], 0)):
		choices.reverse()
	for upgrade in choices:
		if not SimEngine.research_producer_block_reason(producer, upgrade).is_empty() or not SimEngine.research_block_reason(producer.owner, upgrade).is_empty():
			continue
		if RTSCommanderAI.issue_order([producer.tag], "research_" + upgrade).ok:
			return

func _try_workshop_mix(workshop: Dictionary, player: Dictionary, counts: Dictionary, response: Dictionary, armory_ready: bool, reserve: int) -> bool:
	var crystal := int(player.crystal) - reserve
	var aether := int(player.aether)
	if armory_ready and response.air > 0 and crystal >= 425 and aether >= 275 and counts.get("atlas_walker", 0) + counts.get("atlas_walker_precision", 0) < 2:
		if RTSCommanderAI.issue_order([workshop.tag], "train_atlas_walker").ok:
			return true
	if response.light_ground and crystal >= 230:
		var cinders: int = counts.get("cinder_runner", 0) + counts.get("cinder_guard", 0)
		if cinders < 2 and RTSCommanderAI.issue_order([workshop.tag], "train_cinder_runner").ok:
			return true
		if aether >= 150 and counts.get("sentinel_mine", 0) + counts.get("sentinel_mine_armed", 0) < 2:
			if RTSCommanderAI.issue_order([workshop.tag], "train_sentinel_mine").ok:
				return true
	if crystal >= 325 and aether >= 230 and counts.get("vortex_rover", 0) < 2:
		return RTSCommanderAI.issue_order([workshop.tag], "train_vortex_rover").ok
	return false

func _next_gas_worker(workers: Array, tap: Dictionary, scout_tag: int, assigned: Dictionary) -> Dictionary:
	var nearest := {}
	var nearest_distance := INF
	for worker in workers:
		if worker.tag == scout_tag or assigned.has(worker.tag):
			continue
		if not worker.orders.is_empty() and worker.orders[0].type != "harvest":
			continue
		if not SimEngine.ladder_rules or worker.harvest_target_tag == tap.tag:
			return worker
		var distance: float = worker.pos.distance_squared_to(tap.pos)
		if distance < nearest_distance:
			nearest = worker
			nearest_distance = distance
	return nearest

func _counter_orders(pid: int, cfg: Dictionary, faction: String, mine: Array, halls: Array, counts: Dictionary) -> Dictionary:
	var evidence: Dictionary = cfg.get("counter_evidence", {})
	var detector: String = DETECTORS[faction]
	var detector_count: int = counts.get(detector, 0)
	if SimEngine.ladder_rules and faction == RTSData.FACTION_MONSTERS:
		detector_count += int(counts.get("spore_seer", 0)) + int(counts.get("seer_cocoon", 0))
	var tracked: Dictionary = evidence.get("cloak_track", {})
	var track_seen := false
	var seen_air := 0
	var seen_light_ground := 0
	var seen_ranged := 0
	var seen_cloak := false
	var local_contact := {}
	var ground_pressure := {}
	for enemy in SimEngine.units.values():
		if enemy.owner == 0 or enemy.owner == pid or not RTSCommanderAI.sees_enemy(pid, enemy) or enemy.is_worker or enemy.is_structure or enemy.get("nonblocking", false):
			continue
		if SimEngine.can_identify_hallucination(pid, enemy):
			continue
		if enemy.flight_height > 0.0:
			seen_air += 1
		elif "Light" in enemy.attributes:
			seen_light_ground += 1
		if faction == RTSData.FACTION_HUMANS and enemy.flight_height <= 0.0:
			for hall in halls:
				if hall.pos.distance_squared_to(enemy.pos) <= (DEFENSE_RADIUS + 10.0) ** 2:
					ground_pressure[hall.tag] = int(ground_pressure.get(hall.tag, 0)) + 1
		if SimEngine.is_ranged_weapon(SimEngine._active_weapon(enemy)):
			seen_ranged += 1
		if enemy.tag == tracked.get("tag", 0):
			track_seen = true
		var hidden: bool = enemy.get("cloaked", false) or enemy.get("burrowed", false)
		if not hidden and (seen_cloak or not RTSData.get_unit_def(enemy.unit_type).get("abilities", []).has("phase_cloak")):
			continue
		for hall in halls:
			if SimEngine.is_dropoff(hall, pid) and hall.pos.distance_squared_to(enemy.pos) <= DEFENSE_RADIUS * DEFENSE_RADIUS:
				local_contact = {"tag": enemy.tag, "pos": enemy.pos, "hall": hall.tag, "seen_at": SimEngine.tick}
				seen_cloak = seen_cloak or hidden
				break
	if seen_air > 0:
		evidence["air_goal"] = clampi(seen_air, 1, 3)
		evidence["air_until"] = SimEngine.tick + AIR_EVIDENCE_TICKS
	if seen_light_ground >= 4:
		evidence["light_ground_until"] = SimEngine.tick + AIR_EVIDENCE_TICKS
	if seen_ranged >= 4:
		evidence["ranged_until"] = SimEngine.tick + AIR_EVIDENCE_TICKS
	if not local_contact.is_empty():
		var hall: Dictionary = SimEngine.units[local_contact.hall]
		evidence["detector_site"] = hall.pos + (local_contact.pos - hall.pos).limit_length(7.0)
		var previous_goal: int = evidence.get("detector_goal", 0) if SimEngine.tick < int(evidence.get("stealth_until", 0)) else 0
		if seen_cloak and not evidence.get("cloak_visible", false):
			previous_goal = maxi(previous_goal, mini(2, detector_count + 1))
		evidence["detector_goal"] = maxi(previous_goal, 1)
		evidence["stealth_until"] = SimEngine.tick + STEALTH_EVIDENCE_TICKS
		evidence["cloak_track"] = local_contact
	elif detector_count == 0:
		var clue := _unseen_weapon_contact(pid, halls, int(evidence.get("last_unseen_hit", -1)))
		if not clue.is_empty():
			evidence["last_unseen_hit"] = clue.seen_at
			evidence["detector_goal"] = maxi(1, int(evidence.get("detector_goal", 0)))
			evidence["detector_site"] = clue.site
			evidence["stealth_until"] = SimEngine.tick + STEALTH_EVIDENCE_TICKS
			if faction == RTSData.FACTION_HUMANS:
				_try_observed_sweep(pid, evidence, clue)
	evidence["cloak_visible"] = seen_cloak
	if faction == RTSData.FACTION_HUMANS and not track_seen and not tracked.is_empty():
		_try_observed_sweep(pid, evidence, tracked)
	cfg["counter_evidence"] = evidence

	var air_needed := 0
	if SimEngine.tick < int(evidence.get("air_until", 0)):
		var counters := ["brood_keeper", "blight_hurler", "corrosion_flyer"] if SimEngine.ladder_rules and faction == RTSData.FACTION_MONSTERS else [AIR_COUNTERS[faction]]
		var committed := 0
		for counter in counters:
			committed += int(counts.get(counter, 0))
		for unit in mine:
			if unit.is_structure:
				for item in unit.production_queue:
					if item.get("unit_type") in counters:
						committed += 1
		air_needed = maxi(0, int(evidence.air_goal) - committed)
	var detector_needed: bool = SimEngine.tick < int(evidence.get("stealth_until", 0)) and detector_count < int(evidence.get("detector_goal", 0))
	# A Sentry also provides an immediate local answer while airframes are built.
	detector_needed = detector_needed or (faction == RTSData.FACTION_HUMANS and air_needed > 0 and detector_count == 0)
	if SimEngine.ladder_rules and faction == RTSData.FACTION_MONSTERS and air_needed > 0 and detector_count == 0:
		detector_needed = SimEngine.has_tech_structure(pid, "hatchling_pool")
	var ground_defense_hall := 0
	var most_contacts := 3
	for hall in halls:
		var contacts: int = ground_pressure.get(hall.tag, 0)
		if not hall.get("hub_operations", false) and hall.unit_type == "colony_hub" and contacts > most_contacts:
			most_contacts = contacts
			ground_defense_hall = hall.tag
	return {"air": air_needed, "detector": detector if detector_needed else "",
		"ground_defense_hall": ground_defense_hall,
		"light_ground": SimEngine.tick < int(evidence.get("light_ground_until", 0)),
		"ranged": SimEngine.tick < int(evidence.get("ranged_until", 0)),
		"detection_alert": SimEngine.tick < int(evidence.get("stealth_until", 0)),
		"detector_site": evidence.get("detector_site", halls[0].pos)}

func _unseen_weapon_contact(pid: int, halls: Array, last_processed: int) -> Dictionary:
	var clue: Dictionary = SimEngine.unseen_weapon_hits.get(pid, {})
	if (clue.is_empty() or int(clue.count) < 2 or int(clue.tick) <= last_processed
			or SimEngine.tick - int(clue.tick) > 4 * SimEngine.TICK_RATE
			or not SimEngine.can_see_position(pid, clue.pos)):
		return {}
	for hall in halls:
		if not SimEngine.is_dropoff(hall, pid) or hall.pos.distance_squared_to(clue.pos) > DEFENSE_RADIUS ** 2:
			continue
		if not RTSCommanderAI.look_at(pid, clue.pos):
			return {}
		var offset: Vector2 = clue.pos - hall.pos
		return {"pos": clue.pos, "seen_at": clue.tick, "hall": hall.tag, "site": hall.pos + offset.limit_length(7.0)}
	return {}

func _try_observed_sweep(pid: int, evidence: Dictionary, tracked: Dictionary) -> void:
	# Investigate a last visible location. A sweep never receives the unit's
	# hidden position, and actual detection is still required for escalation.
	if SimEngine.vision == null or SimEngine.tick < int(evidence.get("next_recon", 0)):
		return
	if SimEngine.tick - int(tracked.seen_at) > 4 * 64 or not SimEngine.can_see_position(pid, tracked.pos):
		return
	var hall: Dictionary = SimEngine.units.get(tracked.hall, {})
	if not hall.is_empty() and SimEngine.can_use_hub_power(hall):
		if RTSCommanderAI.issue_order([hall.tag], "recon_sweep", tracked.pos).ok:
			evidence["next_recon"] = SimEngine.tick + RECON_RETRY_TICKS
		return
	for orbital in SimEngine.units.values():
		if orbital.owner == pid and SimEngine.can_use_hub_power(orbital):
			if RTSCommanderAI.issue_order([orbital.tag], "recon_sweep", tracked.pos).ok:
				evidence["next_recon"] = SimEngine.tick + RECON_RETRY_TICKS
			return

func _train_recovery_workers(halls: Array, worker_type: String, worker_count: int) -> void:
	var committed := worker_count
	for hall in halls:
		for job in hall.production_queue:
			if job.get("unit_type") == worker_type:
				committed += 1
	for hall in halls:
		if committed >= RECOVERY_WORKER_TARGET:
			return
		if not hall.production_queue.is_empty() and not SimEngine.uses_brood_slots(hall):
			continue
		if RTSCommanderAI.issue_order([hall.tag], "train_" + worker_type).ok:
			committed += 1

func _step_asymmetric_macro(pid: int, cfg: Dictionary, mine: Array, workers: Array, army: Array, halls: Array, counts: Dictionary, response: Dictionary) -> void:
	var p: Dictionary = SimEngine.players[pid]
	var roster: Dictionary = RTSData.faction_info[p.faction]
	var brood: bool = p.faction == RTSData.FACTION_MONSTERS
	var ladder_brood: bool = brood and SimEngine.ladder_rules
	var ladder_concord: bool = not brood and SimEngine.ladder_rules
	var tech_transition := SimEngine.ladder_rules and SimEngine.sim_time >= LADDER_TECH_SECONDS
	var supply_type := "brood_pod" if brood else "resonator"
	var base: Vector2 = halls[0].pos
	var strategy: String = cfg.get("strategy", "balanced")
	var difficulty: String = cfg.get("difficulty", "normal")
	var completed_supply := mine.filter(func(u): return u.unit_type == supply_type and u.build_progress >= 1.0).size()
	var needs_power := not brood and int(counts.get(supply_type, 0)) == 0
	if ladder_brood and int(counts.get("hatchling_pool", 0)) == 0:
		_build(workers, "hatchling_pool", base)
		_attack(pid, army, cfg, false)
		return
	# Repeated supply orders and combat pans can keep a rush out of the late
	# macro block for minutes. Start the first gas tap before those decisions.
	if ladder_brood and SimEngine.sim_time >= LADDER_BROOD_GAS_SECONDS and workers.size() >= 12 \
			and int(counts.get("spore_tap", 0)) == 0 and p.crystal >= 125:
		_build(workers, "spore_tap", base)
	var lair_ready := ladder_brood and SimEngine.has_tech_structure(pid, "brood_lair")
	var pit_ready := ladder_brood and SimEngine.has_tech_structure(pid, "infestation_pit")
	var hive_ready := ladder_brood and SimEngine.has_tech_structure(pid, "brood_hive")
	if lair_ready:
		_use_spore_seer(pid, mine, counts, response, base)
	if ladder_brood and tech_transition and p.crystal >= 350 and p.aether >= 225:
		var next_form := "brood_lair" if not lair_ready else ""
		if pit_ready and not hive_ready and p.crystal >= 500 and p.aether >= 350:
			next_form = "brood_hive"
		var evolving := halls.any(func(nest):
			return nest.production_queue.any(func(job): return job.get("structure_evolution", false) and job.unit_type == next_form))
		if not next_form.is_empty() and not evolving:
			for nest in halls:
				if not SimEngine.structure_evolution_block_reason(nest, next_form).is_empty():
					continue
				var evolution := RTSCommanderAI.issue_order([nest.tag], "evolve_" + next_form)
				if evolution.ok or evolution.get("camera_pending", false):
					break
	if needs_power or (p.supply_cap < 200 and p.supply_cap - p.supply_used <= 4):
		if ladder_brood:
			var pending_sac := halls.any(func(hall):
				return hall.production_queue.any(func(job): return job.get("unit_type") == "drift_sac"))
			if not pending_sac and p.crystal >= RTSData.get_unit_def("drift_sac").crystal_cost:
				for nest in halls:
					if nest.build_progress >= 1.0 and nest.brood_slots > 0 and RTSCommanderAI.issue_order([nest.tag], "train_drift_sac").ok:
						break
		elif int(counts.get(supply_type, 0)) == completed_supply:
			_build(workers, supply_type, base)
		_attack(pid, army, cfg, false)
		return
	if not brood and not mine.any(func(u): return u.unit_type in ["waystone", "transit_waystone"]):
		if int(counts.get("waystone", 0)) == 0:
			_build(workers, "waystone", base)
		_attack(pid, army, cfg, false)
		return
	var air_needed: int = response.air
	var core_ready := not ladder_concord or SimEngine.has_tech_structure(pid, "concord_core")
	var star_assembly_ready := ladder_concord and SimEngine.has_tech_structure(pid, "star_assembly")
	var dawn_fighters := int(counts.get("dawn_interceptor", 0))
	var prism_rays := int(counts.get("prism_ray", 0))
	var committed_adepts: int = counts.get("mirage_adept", 0)
	var committed_scribes: int = counts.get("storm_scribe", 0)
	var committed_duskblades: int = counts.get("duskblade", 0)
	var committed_wardens: int = counts.get("aegis_warden", 0)
	if ladder_concord:
		for producer in mine:
			for item in producer.production_queue:
				var queued: String = item.get("unit_type", "")
				if queued == "mirage_adept":
					committed_adepts += 1
				elif queued == "storm_scribe":
					committed_scribes += 1
				elif queued == "duskblade":
					committed_duskblades += 1
				elif queued == "aegis_warden":
					committed_wardens += 1
				elif queued == "dawn_interceptor":
					dawn_fighters += 1
				elif queued == "prism_ray":
					prism_rays += 1
	var forge_ready := not ladder_concord or SimEngine.has_tech_structure(pid, "prism_forge")
	if ladder_concord and int(counts.get("prism_forge", 0)) == 0 and (not response.detector.is_empty() or (core_ready and tech_transition and p.crystal >= 375 and p.aether >= 150)):
		_build(workers, "prism_forge", base)
	if ladder_concord and int(counts.get("concord_core", 0)) == 0 and (air_needed > 0 or SimEngine.sim_time > 85.0):
		_build(workers, "concord_core", base)
	if ladder_concord and core_ready and int(counts.get("star_assembly", 0)) == 0 \
			and p.crystal >= 350 and p.aether >= 275 and (air_needed >= 2 or (strategy == "siege" and army.size() >= 22)):
		_build(workers, "star_assembly", base)
	if star_assembly_ready and int(counts.get("fleet_spire", 0)) == 0 and dawn_fighters + prism_rays >= 4 \
			and p.crystal >= 550 and p.aether >= 400:
		_build(workers, "fleet_spire", base)
	if ladder_concord and core_ready and tech_transition and int(counts.get("twilight_array", 0)) == 0 and p.aether >= 200 and p.crystal >= 300:
		_build(workers, "twilight_array", base)
	var archive_ready := ladder_concord and SimEngine.has_tech_structure(pid, "canticle_archive")
	if (ladder_concord and not archive_ready and int(counts.get("canticle_archive", 0)) == 0
			and army.size() >= 16 and p.aether >= 350 and p.crystal >= 400
			and SimEngine.has_tech_structure(pid, "twilight_array")):
		_build(workers, "canticle_archive", base)
	var sanctum_ready := ladder_concord and SimEngine.has_tech_structure(pid, "veil_sanctum")
	if (ladder_concord and not sanctum_ready and int(counts.get("veil_sanctum", 0)) == 0 and response.light_ground
			and army.size() >= 10 and p.aether >= 325 and p.crystal >= 350
			and SimEngine.has_tech_structure(pid, "twilight_array")):
		_build(workers, "veil_sanctum", base)
	if ladder_concord and core_ready and tech_transition and int(counts.get("robotics_foundry", 0)) == 0 and p.aether >= 225 and p.crystal >= 375:
		_build(workers, "robotics_foundry", base)
	var annex_ready := ladder_concord and SimEngine.has_tech_structure(pid, "robotics_annex")
	if ladder_concord and not annex_ready and int(counts.get("robotics_annex", 0)) == 0 and p.aether >= 275 and p.crystal >= 375 \
			and SimEngine.has_tech_structure(pid, "robotics_foundry"):
		_build(workers, "robotics_annex", base)
	if ladder_concord and core_ready and int(counts.get("aegis_capacitor", 0)) == 0 and p.crystal >= 200:
		var damaged_defenders := army.filter(func(unit):
			return (unit.pos.distance_squared_to(base) < DEFENSE_RADIUS ** 2 and unit.shields < unit.max_shields * 0.5
				and RTSCommanderAI.is_on_camera(pid, unit.pos)))
		if damaged_defenders.size() >= 2:
			_build(workers, "aegis_capacitor", base)
	var pool_ready := not ladder_brood or SimEngine.has_tech_structure(pid, "hatchling_pool")
	var warren_ready := not ladder_brood or SimEngine.has_tech_structure(pid, "bile_warren")
	var den_ready := not ladder_brood or SimEngine.has_tech_structure(pid, "spine_den")
	var ambusher_den_ready := ladder_brood and SimEngine.has_tech_structure(pid, "ambusher_den")
	var cavern_ready := ladder_brood and SimEngine.has_tech_structure(pid, "carapace_cavern")
	var greater_spire_ready := ladder_brood and SimEngine.has_tech_structure(pid, "greater_blight_spire")
	if greater_spire_ready and int(counts.get("corrosion_flyer", 0)) >= 2 \
			and int(counts.get("brood_siege_flyer", 0)) + int(counts.get("siege_flyer_cocoon", 0)) < 3 \
			and p.crystal >= 350 and p.aether >= 325:
		for flyer in army:
			if flyer.unit_type != "corrosion_flyer" or not SimEngine.brood_morph_block_reason(flyer, "brood_siege_flyer").is_empty():
				continue
			var result := RTSCommanderAI.issue_order([flyer.tag], "morph_brood_siege_flyer")
			if result.ok or result.get("camera_pending", false):
				break
	if ladder_brood and not cavern_ready and int(counts.get("carapace_cavern", 0)) == 0 \
			and p.aether >= 400 and p.crystal >= 450 and hive_ready:
		_build(workers, "carapace_cavern", base)
	if lair_ready and not den_ready and int(counts.get("spine_den", 0)) == 0 \
			and p.aether >= 225 and p.crystal >= 350 and (strategy == "siege" or air_needed > 0):
		_build(workers, "spine_den", base)
	if lair_ready and not pit_ready and int(counts.get("infestation_pit", 0)) == 0 \
			and army.size() >= 20 and p.aether >= 400 and p.crystal >= 500:
		_build(workers, "infestation_pit", base)
	if lair_ready and strategy == "siege":
		if int(counts.get("tunnel_mouth", 0)) > 0:
			_use_brood_tunnel(pid, mine, army)
		elif army.size() >= 24 and p.aether >= 450 and p.crystal >= 600:
			_build(workers, "tunnel_mouth", base)
	if ladder_brood and tech_transition and int(counts.get("adaptation_chamber", 0)) == 0 \
			and army.size() >= 10 and p.aether >= 200 and p.crystal >= 275:
		_build(workers, "adaptation_chamber", base)
	if ladder_brood and den_ready and not ambusher_den_ready and int(counts.get("ambusher_den", 0)) == 0 \
			and int(counts.get("blight_hurler", 0)) >= 4 and p.aether >= 300 and p.crystal >= 325:
		_build(workers, "ambusher_den", base)
	if ambusher_den_ready and int(counts.get("blight_hurler", 0)) >= 4 \
			and int(counts.get("spine_ambusher", 0)) + int(counts.get("ambusher_cocoon", 0)) < 3 \
			and p.aether >= 175 and p.crystal >= 175:
		for hurler in army:
			if hurler.unit_type != "blight_hurler" or not SimEngine.brood_morph_block_reason(hurler, "spine_ambusher").is_empty():
				continue
			var result := RTSCommanderAI.issue_order([hurler.tag], "morph_spine_ambusher")
			if result.ok or result.get("camera_pending", false):
				break
	if (ladder_brood and warren_ready and int(counts.get("bile_crawler", 0)) >= 4
			and int(counts.get("rupture_crawler", 0)) + int(counts.get("rupture_cocoon", 0)) < 2
			and p.crystal >= 175 and p.aether >= 100):
		for crawler in army:
			if crawler.unit_type != "bile_crawler" or not SimEngine.brood_morph_block_reason(crawler, "rupture_crawler").is_empty():
				continue
			var morph := RTSCommanderAI.issue_order([crawler.tag], "morph_rupture_crawler")
			if morph.ok or morph.get("camera_pending", false):
				break
	if not response.detector.is_empty() and forge_ready:
		_build(workers, response.detector, response.detector_site)
	if (strategy != "rush" or air_needed > 0 or tech_transition) and int(counts.get(roster.extractor, 0)) == 0 and (brood or int(counts.get("waystone", 0)) > 0):
		_build(workers, roster.extractor, base)
	var pending_hall: bool = int(counts.get(roster.town_hall, 0)) > halls.size()
	var building_hall: bool = pending_hall or halls.any(func(u): return u.build_progress < 1.0)
	var wants_expansion: bool = (strategy == "economy" or tech_transition) and workers.size() >= 18 and SimEngine.sim_time >= 85 and halls.size() < 2
	var needs_expansion: bool = not SimEngine.unlimited_resources and workers.size() >= 12 and _needs_new_mineral_line(halls)
	var hall_cost: int = RTSData.get_unit_def(roster.town_hall).crystal_cost
	var training_cost: int = RTSData.get_unit_def("skitterling" if brood else "sunblade").crystal_cost
	var reserve_for_expansion: bool = p.crystal < hall_cost + training_cost
	if pending_hall and (wants_expansion or needs_expansion) and reserve_for_expansion:
		_attack(pid, army, cfg, false)
		return
	if not building_hall and (wants_expansion or needs_expansion):
		var expansion := _expansion_position(pid, base, 12.0)
		if expansion != Vector2.ZERO:
			_build(workers, roster.town_hall, expansion, true)
			if reserve_for_expansion:
				_attack(pid, army, cfg, false)
				return
	if not building_hall and brood and halls.size() < 3 and (strategy != "economy" or halls.size() > 1) and p.crystal >= 375 and workers.size() >= 13:
		_build(workers, roster.town_hall, base)
	if ladder_brood and pool_ready and not warren_ready and int(counts.get("bile_warren", 0)) == 0 and (tech_transition or air_needed > 0 or strategy != "rush"):
		_build(workers, "bile_warren", base)
	if lair_ready and tech_transition and int(counts.get("blight_spire", 0)) == 0:
		_build(workers, "blight_spire", base)
	var concord_gates := int(counts.get("waystone", 0)) + int(counts.get("transit_waystone", 0))
	if not brood and concord_gates < (3 if difficulty == "hard" else 2) and p.crystal >= 180:
		_build(workers, "waystone", base)
	var worker_target: int = {"easy": 14, "normal": 20, "hard": 24}[difficulty] + (5 if strategy == "economy" else 0)
	var committed_workers := workers.size()
	if ladder_brood and pool_ready:
		_use_brood_keepers(mine, halls, workers.size(), air_needed)
		_spread_brood_growth_nodes(pid, mine)
	var can_hatch_flyers := ladder_brood and tech_transition and SimEngine.has_tech_structure(pid, "blight_spire")
	var committed_flyers := int(counts.get("needlewing", 0))
	var committed_corrosion := int(counts.get("corrosion_flyer", 0))
	var can_hatch_crawlers := ladder_brood and tech_transition and warren_ready
	var committed_crawlers := int(counts.get("bile_crawler", 0))
	var committed_bulwarks := int(counts.get("carapace_bulwark", 0))
	var committed_mireweavers := int(counts.get("mireweaver", 0))
	var committed_brooders := int(counts.get("locust_brooder", 0))
	var committed_wyrms := int(counts.get("siphon_wyrm", 0))
	var crawler_target := clampi(army.size() / 3, 4, 12)
	for hall in halls:
		for item in hall.production_queue:
			if item.get("unit_type") == roster.worker:
				committed_workers += 1
			elif item.get("unit_type") == "needlewing":
				committed_flyers += 1
			elif item.get("unit_type") == "corrosion_flyer":
				committed_corrosion += 1
			elif item.get("unit_type") == "bile_crawler":
				committed_crawlers += 1
			elif item.get("unit_type") == "carapace_bulwark":
				committed_bulwarks += 1
			elif item.get("unit_type") == "mireweaver":
				committed_mireweavers += 1
			elif item.get("unit_type") == "locust_brooder":
				committed_brooders += 1
			elif item.get("unit_type") == "siphon_wyrm":
				committed_wyrms += 1
	for producer in mine:
		if producer.build_progress < 1.0:
			continue
		if brood and producer.unit_type == roster.town_hall:
			if ladder_brood and committed_crawlers >= 4 and p.crystal >= 350 and p.aether >= 250 \
					and SimEngine.research_block_reason(pid, "burrow").is_empty():
				RTSCommanderAI.issue_order([producer.tag], "research_burrow")
			for i in range(int(producer.brood_slots)):
				var train := "skitterling"
				if committed_workers < worker_target and (workers.size() < 12 or producer.production_queue.size() == 0):
					train = roster.worker
				elif not pool_ready:
					break
				elif hive_ready and army.size() >= 18 and committed_wyrms < 2 and p.crystal >= 350 and p.aether >= 425 \
						and p.supply_cap - p.supply_used >= 3:
					train = "siphon_wyrm"
				elif pit_ready and army.size() >= 14 and committed_mireweavers < 2 and p.crystal >= 250 and p.aether >= 275:
					train = "mireweaver"
				elif pit_ready and strategy == "siege" and army.size() >= 12 and committed_brooders < 3 \
						and p.crystal >= 250 and p.aether >= 175 and p.supply_cap - p.supply_used >= 3:
					train = "locust_brooder"
				elif cavern_ready and committed_bulwarks < 3 and p.crystal >= 275 and p.aether >= 200 and p.supply_cap - p.supply_used >= 6:
					train = "carapace_bulwark"
				elif air_needed > 0 and not ladder_brood:
					if warren_ready and p.aether >= 25:
						train = "bile_crawler"
				elif can_hatch_flyers and (air_needed > 0 or greater_spire_ready) and committed_corrosion < 4 \
						and p.crystal >= 150 and p.aether >= 100 and p.supply_cap - p.supply_used >= 2:
					train = "corrosion_flyer"
				elif can_hatch_flyers and committed_flyers < 6 and p.crystal >= 100 and p.aether >= 100 and p.supply_cap - p.supply_used >= 2:
					train = "needlewing"
				elif can_hatch_crawlers and committed_crawlers < crawler_target and p.crystal >= 75 and p.aether >= 100 and p.supply_cap - p.supply_used >= 2:
					train = "bile_crawler"
				elif den_ready and (strategy == "siege" or air_needed > 0) and p.aether >= (50 if ladder_brood else 100):
					train = "blight_hurler"
				elif warren_ready and strategy != "rush" and p.aether >= 25:
					train = "bile_crawler"
				if not RTSCommanderAI.issue_order([producer.tag], "train_" + train).ok:
					break
				if train == roster.worker:
					committed_workers += 1
				elif train == "needlewing":
					committed_flyers += 1
				elif train == "corrosion_flyer":
					committed_corrosion += 1
					air_needed = maxi(0, air_needed - 1)
				elif train == "bile_crawler":
					committed_crawlers += 1
					if not ladder_brood and air_needed > 0:
						air_needed -= 1
				elif train == "carapace_bulwark":
					committed_bulwarks += 1
				elif train == "mireweaver":
					committed_mireweavers += 1
				elif train == "locust_brooder":
					committed_brooders += 1
				elif train == "siphon_wyrm":
					committed_wyrms += 1
				elif train == "blight_hurler":
					air_needed = maxi(0, air_needed - 1)
		elif ladder_brood and lair_ready and producer.unit_type == "bile_warren" and producer.production_queue.is_empty() \
				and committed_crawlers >= 5 and p.crystal >= 400 and p.aether >= 300:
			if not p.upgrades.get("glial_reconstitution", 0):
				RTSCommanderAI.issue_order([producer.tag], "research_glial_reconstitution")
			elif p.upgrades.get("burrow", 0) and not p.upgrades.get("tunneling_claws", 0):
				RTSCommanderAI.issue_order([producer.tag], "research_tunneling_claws")
		elif ladder_brood and producer.unit_type == "hatchling_pool" and producer.production_queue.is_empty() \
				and int(counts.get("skitterling", 0)) >= 12 and p.crystal >= 300 and p.aether >= 200:
			if not p.upgrades.get("metabolic_boost", 0):
				RTSCommanderAI.issue_order([producer.tag], "research_metabolic_boost")
			elif hive_ready and not p.upgrades.get("adrenal_glands", 0) and p.crystal >= 425 and p.aether >= 350:
				RTSCommanderAI.issue_order([producer.tag], "research_adrenal_glands")
		elif ladder_brood and producer.unit_type == "adaptation_chamber" and producer.production_queue.is_empty():
			var weapons := "brood_missiles" if committed_crawlers >= 5 else "brood_melee"
			var upgrades := [weapons, "brood_carapace"]
			upgrades.sort_custom(func(a, b): return int(p.upgrades.get(a, 0)) < int(p.upgrades.get(b, 0)))
			for upgrade in upgrades:
				var offer := SimEngine.research_offer(pid, upgrade)
				if offer.is_empty() or p.crystal < offer.crystal + 200 or p.aether < offer.aether + 150 \
						or not SimEngine.research_producer_block_reason(producer, upgrade).is_empty():
					continue
				var result := RTSCommanderAI.issue_order([producer.tag], "research_" + upgrade)
				if result.ok or result.get("camera_pending", false):
					break
		elif ladder_brood and producer.unit_type == "spine_den" and producer.production_queue.is_empty() \
				and int(counts.get("blight_hurler", 0)) >= 3 and p.crystal >= 325 and p.aether >= 225:
			if not p.upgrades.get("grooved_spines", 0):
				RTSCommanderAI.issue_order([producer.tag], "research_grooved_spines")
			elif not p.upgrades.get("muscular_augments", 0):
				RTSCommanderAI.issue_order([producer.tag], "research_muscular_augments")
			elif not p.upgrades.get("nanomuscular_swell", 0) and hive_ready:
				RTSCommanderAI.issue_order([producer.tag], "research_nanomuscular_swell")
		elif ladder_brood and producer.unit_type == "carapace_cavern" and producer.production_queue.is_empty() \
				and committed_bulwarks > 0 and p.crystal >= 425 and p.aether >= 350:
			if not p.upgrades.get("chitinous_plating", 0):
				RTSCommanderAI.issue_order([producer.tag], "research_chitinous_plating")
			elif not p.upgrades.get("anabolic_synthesis", 0):
				RTSCommanderAI.issue_order([producer.tag], "research_anabolic_synthesis")
		elif ladder_brood and producer.unit_type == "infestation_pit" and producer.production_queue.is_empty() \
				and committed_mireweavers > 0 and p.crystal >= 350 and p.aether >= 325:
			if not p.upgrades.get("microbial_shroud", 0):
				RTSCommanderAI.issue_order([producer.tag], "research_microbial_shroud")
			elif not p.upgrades.get("neural_tether", 0):
				RTSCommanderAI.issue_order([producer.tag], "research_neural_tether")
		elif ladder_brood and producer.unit_type == "blight_spire" and producer.production_queue.is_empty():
			if hive_ready and not greater_spire_ready and p.crystal >= 350 and p.aether >= 375:
				RTSCommanderAI.issue_order([producer.tag], "evolve_greater_blight_spire")
				continue
			if committed_flyers + committed_corrosion < 4:
				continue
			var upgrade := "brood_air_weapons" if int(p.upgrades.get("brood_air_weapons", 0)) <= int(p.upgrades.get("brood_air_armor", 0)) else "brood_air_armor"
			var offer := SimEngine.research_offer(pid, upgrade)
			if not offer.is_empty() and p.crystal >= offer.crystal + 175 and p.aether >= offer.aether + 125:
				RTSCommanderAI.issue_order([producer.tag], "research_" + upgrade)
		elif not brood and producer.production_queue.is_empty():
			if producer.unit_type == roster.town_hall and committed_workers < worker_target:
				if RTSCommanderAI.issue_order([producer.tag], "train_" + roster.worker).ok:
					committed_workers += 1
			elif ladder_concord and producer.unit_type == "heartstone" and p.crystal >= 725 and p.aether >= 650 \
					and SimEngine.has_tech_structure(pid, "fleet_spire") and SimEngine.flagship_production_block_reason(pid).is_empty():
				RTSCommanderAI.issue_order([producer.tag], "train_crownspire")
			elif ladder_concord and producer.unit_type == "concord_core" and not p.upgrades.get("transit", 0) and p.aether >= 50:
				RTSCommanderAI.issue_order([producer.tag], "research_transit")
			elif ladder_concord and producer.unit_type == "concord_core" and dawn_fighters + prism_rays >= 4:
				var upgrade := "concord_air_weapons" if int(p.upgrades.get("concord_air_weapons", 0)) <= int(p.upgrades.get("concord_air_armor", 0)) else "concord_air_armor"
				var offer := SimEngine.research_offer(pid, upgrade)
				if not offer.is_empty() and p.crystal >= offer.crystal + 175 and p.aether >= offer.aether + 125:
					RTSCommanderAI.issue_order([producer.tag], "research_" + upgrade)
			elif ladder_concord and producer.unit_type == "star_assembly":
				var fleet_ready := SimEngine.has_tech_structure(pid, "fleet_spire")
				if fleet_ready and int(counts.get("fleet_carrier", 0)) < 2 and p.crystal >= 650 and p.aether >= 450:
					RTSCommanderAI.issue_order([producer.tag], "train_fleet_carrier")
				elif fleet_ready and int(counts.get("horizon_lancer", 0)) < 2 and p.crystal >= 500 and p.aether >= 325:
					RTSCommanderAI.issue_order([producer.tag], "train_horizon_lancer")
				elif air_needed > 0 and dawn_fighters < 6 and p.crystal >= 175 and p.aether >= 100:
					if RTSCommanderAI.issue_order([producer.tag], "train_dawn_interceptor").ok:
						dawn_fighters += 1
				elif not response.detector.is_empty() and int(counts.get("sunseer", 0)) == 0 and p.crystal >= 275 and p.aether >= 200:
					RTSCommanderAI.issue_order([producer.tag], "train_sunseer")
				elif prism_rays < 4 and p.crystal >= 325 and p.aether >= 175:
					if RTSCommanderAI.issue_order([producer.tag], "train_prism_ray").ok:
						prism_rays += 1
			elif ladder_concord and producer.unit_type == "fleet_spire" and p.crystal >= 350 and p.aether >= 250:
				if dawn_fighters >= 3 and not p.upgrades.get("pulse_crystals", 0):
					RTSCommanderAI.issue_order([producer.tag], "research_pulse_crystals")
				elif prism_rays >= 2 and not p.upgrades.get("flux_vanes", 0):
					RTSCommanderAI.issue_order([producer.tag], "research_flux_vanes")
				elif int(counts.get("horizon_lancer", 0)) >= 2 and not p.upgrades.get("tectonic_resonance", 0):
					RTSCommanderAI.issue_order([producer.tag], "research_tectonic_resonance")
			elif ladder_concord and producer.unit_type == "twilight_array":
				if int(counts.get("mirage_adept", 0)) >= 3 and not p.upgrades.get("resonant_glaives", 0) and p.aether >= 100:
					RTSCommanderAI.issue_order([producer.tag], "research_resonant_glaives")
				elif int(counts.get("skirmisher", 0)) >= 3 and not p.upgrades.get("phase_step", 0) and p.aether >= 150:
					RTSCommanderAI.issue_order([producer.tag], "research_phase_step")
				elif int(counts.get("sunblade", 0)) >= 4 and not p.upgrades.get("charge", 0) and p.aether >= 100:
					RTSCommanderAI.issue_order([producer.tag], "research_charge")
			elif ladder_concord and producer.unit_type == "prism_forge":
				for upgrade in ["concord_ground_weapons", "concord_ground_armor", "concord_shields"]:
					var offer := SimEngine.research_offer(pid, upgrade)
					if offer.is_empty() or p.crystal < offer.crystal + 100 or p.aether < offer.aether:
						continue
					var result := RTSCommanderAI.issue_order([producer.tag], "research_" + upgrade)
					if result.ok or result.get("camera_pending", false):
						break
			elif ladder_concord and producer.unit_type == "robotics_foundry":
				if not response.detector.is_empty() and int(counts.get("farsight_wisp", 0)) == 0:
					RTSCommanderAI.issue_order([producer.tag], "train_farsight_wisp")
				elif annex_ready and army.size() >= 12 and int(counts.get("rift_engine", 0)) == 0 and p.crystal >= 150 and p.aether >= 150:
					RTSCommanderAI.issue_order([producer.tag], "train_rift_engine")
				elif annex_ready and p.aether >= 200:
					RTSCommanderAI.issue_order([producer.tag], "train_spire_walker")
				elif int(counts.get("bastion_walker", 0)) < 3 and p.crystal >= 250 and p.aether >= 100:
					RTSCommanderAI.issue_order([producer.tag], "train_bastion_walker")
			elif ladder_concord and producer.unit_type == "robotics_annex":
				if int(counts.get("spire_walker", 0)) >= 2 and p.aether >= 150 and not p.upgrades.get("extended_prism", 0):
					RTSCommanderAI.issue_order([producer.tag], "research_extended_prism")
			elif ladder_concord and producer.unit_type == "canticle_archive":
				if not p.upgrades.get("canticle_storm", 0) and p.crystal >= 200 and p.aether >= 200:
					RTSCommanderAI.issue_order([producer.tag], "research_canticle_storm")
			elif ladder_concord and producer.unit_type == "veil_sanctum":
				if committed_duskblades > 0 and not p.upgrades.get("shadow_stride", 0) and p.aether >= 150:
					RTSCommanderAI.issue_order([producer.tag], "research_shadow_stride")
			elif ladder_concord and producer.unit_type == "transit_waystone":
				var recruit := "skirmisher" if core_ready and p.aether >= 50 else "sunblade"
				if core_ready and air_needed == 0 and response.light_ground and committed_adepts < 4 and p.aether >= 25:
					recruit = "mirage_adept"
				if _deploy_concord_infantry(pid, producer, recruit) and recruit == "mirage_adept":
					committed_adepts += 1
			elif producer.unit_type == "waystone" and SimEngine.is_powered(pid, producer.pos):
				if ladder_concord and p.upgrades.get("transit", 0) and concord_gates > 1 and int(counts.get("transit_waystone", 0)) == 0:
					if RTSCommanderAI.issue_order([producer.tag], "open_transit").ok:
						counts["transit_waystone"] = 1
						continue
				var train := "sunblade"
				if air_needed > 0:
					if core_ready and p.aether >= 50:
						train = "skirmisher"
				elif ladder_concord and core_ready and response.ranged and committed_wardens == 0 and army.size() >= 8 and p.aether >= 150:
					train = "aegis_warden"
				elif archive_ready and p.upgrades.get("canticle_storm", 0) and committed_scribes < 2 and p.aether >= 150:
					train = "storm_scribe"
				elif sanctum_ready and response.light_ground and committed_duskblades < 2 and p.aether >= 125:
					train = "duskblade"
				elif ladder_concord and core_ready and response.light_ground and committed_adepts < 4 and p.aether >= 25:
					train = "mirage_adept"
				elif strategy == "siege" or tech_transition:
					# A Waystone can still train a Sunblade with only a few
					# supply slots left, without spending the saved aether.
					if not ladder_concord and p.aether >= 200 and p.supply_cap - p.supply_used >= 6:
						train = "spire_walker"
					elif core_ready and tech_transition and p.aether >= 50:
						train = "skirmisher"
				elif core_ready and strategy != "rush" and p.aether >= 50:
					train = "skirmisher"
				if RTSCommanderAI.issue_order([producer.tag], "train_" + train).ok:
					if air_needed > 0 and train == "skirmisher":
						air_needed -= 1
					elif train == "mirage_adept":
						committed_adepts += 1
					elif train == "storm_scribe":
						committed_scribes += 1
					elif train == "duskblade":
						committed_duskblades += 1
					elif train == "aegis_warden":
						committed_wardens += 1
	if ladder_concord:
		_spend_heartstone_energy(halls, mine)
		_position_concord_wisps(pid, mine, cfg, response)
		_position_concord_illusion(pid, mine, cfg)
	_attack(pid, army, cfg, false)

func _position_concord_illusion(pid: int, mine: Array, cfg: Dictionary) -> void:
	for unit in mine:
		if unit.unit_type != "lumen_carrier" or not unit.get("hallucinated", false):
			continue
		if unit.orders.is_empty():
			var scout: Dictionary = cfg.get("illusion_scout", {})
			var site := _scout_position(pid, unit.pos, scout)
			cfg["illusion_scout"] = scout
			if site != Vector2.ZERO:
				RTSCommanderAI.issue_order([unit.tag], "move", site)
		return
	if mine.any(func(unit): return unit.unit_type == "farsight_wisp"):
		return
	for unit in mine:
		if unit.unit_type == "aegis_warden" and unit.energy >= 150.0 and RTSCommanderAI.is_on_camera(pid, unit.pos):
			RTSCommanderAI.issue_order([unit.tag], "hallucinate_lumen_carrier")
			return

func _position_concord_wisps(pid: int, mine: Array, cfg: Dictionary, response: Dictionary) -> void:
	for wisp in mine:
		if wisp.unit_type != "farsight_wisp":
			continue
		if not response.detector.is_empty():
			var site: Vector2 = response.detector_site
			if wisp.pos.distance_squared_to(site) > 12.0 ** 2:
				if wisp.is_immobile:
					RTSCommanderAI.issue_order([wisp.tag], "surveillance_mode")
				elif wisp.orders.is_empty():
					RTSCommanderAI.issue_order([wisp.tag], "move", site)
			elif not wisp.is_immobile and wisp.orders.is_empty():
				RTSCommanderAI.issue_order([wisp.tag], "surveillance_mode")
			return
		if wisp.is_immobile:
			RTSCommanderAI.issue_order([wisp.tag], "surveillance_mode")
		elif wisp.orders.is_empty() and SimEngine.vision != null:
			var scout: Dictionary = cfg.get("wisp_scout", {})
			var site := _scout_position(pid, wisp.pos, scout)
			cfg["wisp_scout"] = scout
			if site != Vector2.ZERO:
				RTSCommanderAI.issue_order([wisp.tag], "move", site)
		return

func _deploy_concord_infantry(pid: int, gate: Dictionary, unit_type: String) -> bool:
	if not SimEngine.transit_deploy_block_reason(gate, unit_type).is_empty():
		return false
	var definition := RTSData.get_unit_def(unit_type)
	var bank: Dictionary = SimEngine.players[pid]
	if bank.crystal < definition.crystal_cost or bank.aether < definition.aether_cost or bank.supply_used + definition.supply_cost > bank.supply_cap:
		return false
	for direction in range(8):
		var site: Vector2 = gate.pos + Vector2.from_angle(TAU * float(direction) / 8.0) * 6.0
		if not SimEngine._fast_deployment_site_valid(pid, site, unit_type, [], true):
			continue
		var result := RTSCommanderAI.issue_order([gate.tag], "transit_" + unit_type, site)
		if result.ok or result.get("camera_pending", false):
			return result.ok
	return false

func _spend_heartstone_energy(halls: Array, mine: Array) -> void:
	for hall in halls:
		if not SimEngine.can_use_production_boost(hall):
			continue
		for capacitor in mine:
			if (capacitor.unit_type == "aegis_capacitor" and capacitor.get("support_target_tag", 0) != 0
					and capacitor.energy <= 50.0 and SimEngine.energy_recharge_block_reason(hall).is_empty()
					and SimEngine.energy_recharge_target_reason(hall.owner, capacitor).is_empty()):
				var result := RTSCommanderAI.issue_order([hall.tag], "energy_recharge", capacitor.pos, capacitor.tag)
				if result.ok or result.get("camera_pending", false):
					return
		for producer in mine:
			if producer.production_queue.is_empty() or not SimEngine.production_boost_target_reason(hall.owner, producer).is_empty():
				continue
			var result := RTSCommanderAI.issue_order([hall.tag], "production_boost", producer.pos, producer.tag)
			if result.ok or result.get("camera_pending", false):
				return

func _use_brood_keepers(mine: Array, nests: Array, workers: int, air_needed: int) -> void:
	var keepers := mine.filter(func(unit): return unit.unit_type == "brood_keeper")
	var ready_for_keeper := workers >= 15 and keepers.size() < nests.size()
	if ready_for_keeper or (air_needed > 0 and workers >= RECOVERY_WORKER_TARGET):
		for nest in nests:
			if nest.build_progress >= 1.0 and not nest.production_queue.any(func(job): return job.get("unit_type") == "brood_keeper"):
				if RTSCommanderAI.issue_order([nest.tag], "train_brood_keeper").ok:
					break
	for keeper in keepers:
		if keeper.energy >= LadderRules.TRANSFUSE_ENERGY and _try_keeper_transfuse(keeper):
			continue
		if keeper.energy >= 50.0 and not mine.any(func(unit): return unit.unit_type == "brood_growth_node"):
			if _try_seed_brood_growth_node(keeper):
				continue
		if not keeper.orders.is_empty() or keeper.energy < SimEngine.BROOD_INJECT_COST:
			continue
		for nest in nests:
			if nest.build_progress >= 1.0 and nest.brood_slots < SimEngine.brood_slot_cap() - 3 and SimEngine.brood_inject_remaining(nest) == 0.0:
				if RTSCommanderAI.issue_order([keeper.tag], "inject_brood", nest.pos, nest.tag).ok:
					break

func _try_keeper_transfuse(keeper: Dictionary) -> bool:
	if not RTSCommanderAI.is_on_camera(keeper.owner, keeper.pos) or not SimEngine.transfuse_block_reason(keeper).is_empty():
		return false
	var best: Dictionary = {}
	var most_missing := 90.0
	for ally in SimEngine.query_units_in_radius(keeper.pos, LadderRules.TRANSFUSE_RANGE):
		var missing: float = ally.max_hp - ally.hp
		if (ally.tag != keeper.tag and ally.owner == keeper.owner and ally.attributes.has("Biological")
				and ally.build_progress >= 1.0 and SimEngine.has_living_ground(ally.pos)
				and RTSCommanderAI.is_on_camera(keeper.owner, ally.pos) and missing > most_missing):
			best = ally
			most_missing = missing
	return not best.is_empty() and RTSCommanderAI.issue_order([keeper.tag], "transfuse_brood", best.pos, best.tag).ok

func _try_seed_brood_growth_node(keeper: Dictionary) -> bool:
	if not RTSCommanderAI.is_on_camera(keeper.owner, keeper.pos) or not SimEngine.growth_node_block_reason(keeper, "seed_growth_node").is_empty():
		return false
	var center := Vector2(SimEngine.map_width, SimEngine.map_height) * 0.5
	var heading: Vector2 = keeper.pos.direction_to(center)
	for angle in [0.0, 0.75, -0.75, 1.5, -1.5, PI]:
		var site: Vector2 = keeper.pos + heading.rotated(angle) * 4.0
		if (RTSCommanderAI.is_on_camera(keeper.owner, site) and SimEngine.has_living_ground(site)
				and SimEngine.can_see_position(keeper.owner, site) and SimEngine.can_place_structure("brood_growth_node", site)):
			return RTSCommanderAI.issue_order([keeper.tag], "seed_growth_node", site).ok
	return false

func _spread_brood_growth_nodes(pid: int, own: Array) -> void:
	var center := Vector2(SimEngine.map_width, SimEngine.map_height) * 0.5
	for node in own:
		if (node.unit_type != "brood_growth_node" or not RTSCommanderAI.is_on_camera(pid, node.pos)
				or not SimEngine.growth_node_block_reason(node, "spread_growth_node").is_empty()):
			continue
		var heading: Vector2 = node.pos.direction_to(center)
		for angle in [0.0, 0.45, -0.45, 0.9, -0.9]:
			var site: Vector2 = node.pos + heading.rotated(angle) * 20.0
			if (RTSCommanderAI.is_on_camera(pid, site) and SimEngine.has_living_ground(site)
					and SimEngine.can_see_position(pid, site) and SimEngine.can_place_structure("brood_growth_node", site)):
				if RTSCommanderAI.issue_order([node.tag], "spread_growth_node", site).ok:
					return

func _build(workers: Array, structure_type: String, base: Vector2, exact: bool = false) -> void:
	if workers.is_empty():
		return
	var def = RTSData.get_unit_def(structure_type)
	var p: Dictionary = SimEngine.players[workers[0].owner]
	if p.crystal < int(def.get("crystal_cost", 0)) or p.aether < int(def.get("aether_cost", 0)):
		return
	var pid: int = workers[0].owner
	var extractor: bool = def.get("is_extractor", false)
	if not extractor and not RTSCommanderAI.look_at(pid, base):
		return
	var candidate = Vector2.ZERO
	if exact and not SimEngine.can_see_position(pid, base):
		if workers.any(func(worker):
			return not worker.orders.is_empty() and worker.orders[0].type == "move" and worker.orders[0].target_pos == base):
			return
		for worker in workers:
			if worker.orders.is_empty() or worker.orders[0].type == "harvest":
				RTSCommanderAI.issue_order([worker.tag], "move", base)
				return
	if exact:
		candidate = base
	elif extractor:
		var occupied_vents := {}
		for unit in SimEngine.units.values():
			if unit.owner == pid and unit.is_extractor:
				occupied_vents[unit.pos] = true
		for res in SimEngine.resources.values():
			if res.resource_type != "aether_vent" or occupied_vents.has(res.pos) or res.pos.distance_to(base) >= 24 or not SimEngine.can_see_position(pid, res.pos):
				continue
			if not SimEngine.unlimited_resources and not SimEngine.deposit_present(res):
				continue
			if not RTSCommanderAI.look_at(pid, res.pos):
				return
			if SimEngine.can_place_structure(structure_type, res.pos):
				candidate = res.pos
				break
	else:
		for radius in [11.0, 20.0, 29.0, 38.0]:
			for i in range(16):
				var angle = TAU * float(i) / 16.0
				var pos = base + Vector2(cos(angle), sin(angle)) * radius
				if not RTSCommanderAI.is_on_camera(pid, pos) or not SimEngine.can_see_position(pid, pos):
					continue
				if SimEngine.requires_power(structure_type) and not SimEngine.is_powered(workers[0].owner, pos):
					continue
				if def.get("requires_living_ground", false) and not SimEngine.has_active_living_ground(pos, pid):
					continue
				if SimEngine.can_place_structure(structure_type, pos):
					candidate = pos
					break
			if candidate != Vector2.ZERO:
				break
	if candidate == Vector2.ZERO:
		return
	var builder := {}
	var closest := INF
	for worker in workers:
		if not worker.orders.is_empty() and worker.orders[0].type != "harvest":
			continue
		var distance: float = worker.pos.distance_squared_to(candidate)
		if distance < closest:
			builder = worker
			closest = distance
	if not builder.is_empty():
		RTSCommanderAI.issue_order([builder.tag], "build_" + structure_type, candidate)

func _expansion_position(pid: int, base: Vector2, clearance: float = 26.0) -> Vector2:
	var best = Vector2.ZERO
	var distance = INF
	var known := _known_enemy_buildings(pid)
	for u in SimEngine.units.values():
		if u.owner == pid and u.is_structure:
			known.append(u)
	for start in SimEngine.match_state.get("starts", []) + SimEngine.match_state.get("expansions", []):
		var pos = Vector2(float(start.x), float(start.y))
		if not SimEngine.unlimited_resources and SimEngine.can_see_position(pid, pos) and _crystal_near(pos) < 2500:
			continue
		var occupied = false
		for u in known:
			if u.pos.distance_to(pos) < clearance:
				occupied = true
		if not occupied and pos.distance_to(base) < distance:
			best = pos
			distance = pos.distance_to(base)
	return best

func _crystal_near(base: Vector2) -> int:
	var total := 0
	for deposit in SimEngine.resources.values():
		if deposit.resource_type != "crystal_field":
			continue
		var anchor: Vector2 = deposit.get("line_origin", deposit.pos)
		var reach := 6.0 if deposit.has("line_origin") else 26.0
		if anchor.distance_squared_to(base) <= reach * reach:
			total += deposit.amount
	return total

func _needs_new_mineral_line(halls: Array) -> bool:
	for hall in halls:
		if hall.build_progress < 1.0 or _crystal_near(hall.pos) >= 2500:
			return false
	return true

func _known_enemy_buildings(pid: int) -> Array:
	return RTSCommanderAI.observed_enemy_buildings(pid)

func _step_defense(pid: int, cfg: Dictionary, army: Array, halls: Array) -> void:
	if army.is_empty():
		return
	var threats := {}
	for hall in halls:
		if not SimEngine.is_dropoff(hall, pid):
			continue
		for enemy in SimEngine.query_units_in_radius(hall.pos, AIR_DEFENSE_RADIUS, pid):
			if not SimEngine.is_hostile_contact(pid, enemy) or not SimEngine.can_see_unit(pid, enemy):
				continue
			if not _inspect_defense_contact(pid, cfg, enemy.pos, army):
				continue
			if enemy.is_worker or enemy.is_structure or enemy.get("nonblocking", false):
				continue
			var distance: float = hall.pos.distance_squared_to(enemy.pos)
			var radius := AIR_DEFENSE_RADIUS if enemy.flight_height > 0.0 else DEFENSE_RADIUS
			if distance <= radius * radius and distance < float(threats.get(enemy.tag, {}).get("distance", INF)):
				threats[enemy.tag] = {"enemy": enemy, "center": hall.pos, "distance": distance, "radius_squared": radius * radius}
	var available: Array[Dictionary] = []
	var assigned := 0
	var limit := mini(MAX_DEFENDERS, threats.size() + 1)
	for soldier in army:
		var order: Dictionary = soldier.orders.front() if not soldier.orders.is_empty() else {}
		if not order.has("_defense_intercept"):
			if not threats.is_empty() and not soldier.is_immobile and order.is_empty():
				available.append(soldier)
			continue
		if assigned < limit and threats.has(order.target_tag):
			assigned += 1
			continue
		RTSCommanderAI.issue_order([soldier.tag], "move", order._defense_intercept.origin)
	if threats.is_empty() or available.is_empty():
		return
	if assigned >= limit:
		return
	var ordered: Array = threats.values()
	ordered.sort_custom(func(a, b): return a.distance < b.distance)
	for threat in ordered:
		var enemy: Dictionary = threat.enemy
		var airborne: bool = enemy.flight_height > 0.0
		available.sort_custom(func(a, b):
			if airborne and (a.flight_height > 0.0) != (b.flight_height > 0.0):
				return a.flight_height > 0.0
			return a.pos.distance_squared_to(enemy.pos) < b.pos.distance_squared_to(enemy.pos))
		for soldier in available:
			var call_distance := AIR_DEFENDER_CALL_DISTANCE if airborne and soldier.flight_height > 0.0 else DEFENDER_CALL_DISTANCE
			if not soldier.orders.is_empty() or soldier.pos.distance_squared_to(enemy.pos) > call_distance * call_distance:
				continue
			if not SimEngine.can_attack(soldier, enemy) or not _can_intercept(soldier, enemy):
				continue
			var result := RTSCommanderAI.issue_order([soldier.tag], "attack_target", enemy.pos, enemy.tag)
			if result.ok:
				_commit_defense_intercept(cfg, soldier, threat.center, threat.radius_squared)
				assigned += 1
				if assigned >= limit:
					return
			elif result.get("camera_pending", false):
				cfg["defense_intercept_pending"] = {"soldier": soldier.tag, "enemy": enemy.tag,
					"center": threat.center, "radius_squared": threat.radius_squared, "expires": SimEngine.tick + 2 * SimEngine.TICK_RATE}
				return

func _inspect_defense_contact(pid: int, cfg: Dictionary, contact: Vector2, army: Array) -> bool:
	if RTSCommanderAI.is_on_camera(pid, contact):
		return true
	var span: Vector2 = RTSCommanderAI.CommanderView.HALF_VIEW * 2.0 - Vector2(2.0, 2.0)
	# Frame the closest idle guards together with the minimap contact.
	var guards := army.filter(func(unit): return not unit.is_immobile and unit.orders.is_empty())
	guards.sort_custom(func(a, b): return contact.distance_squared_to(a.pos) < contact.distance_squared_to(b.pos))
	var minimum := contact
	var maximum := contact
	var framed := 0
	for guard in guards:
		var lower := minimum.min(guard.pos)
		var upper := maximum.max(guard.pos)
		var room := upper - lower
		if room.x < span.x and room.y < span.y:
			minimum = lower
			maximum = upper
			framed += 1
			if framed == 2:
				break
	RTSCommanderAI.look_at(pid, (minimum + maximum) * 0.5)
	cfg["defense_recheck_tick"] = SimEngine.tick + RTSCommanderAI.CommanderView.PAN_TICKS
	return false

func _continue_defense_intercept(pid: int, cfg: Dictionary) -> bool:
	var plan: Dictionary = cfg.get("defense_intercept_pending", {})
	if plan.is_empty():
		return false
	var soldier: Dictionary = SimEngine.units.get(plan.soldier, {})
	var enemy: Dictionary = SimEngine.units.get(plan.enemy, {})
	if (SimEngine.tick >= int(plan.expires) or soldier.is_empty() or not soldier.orders.is_empty()
			or enemy.is_empty() or not SimEngine.can_see_unit(pid, enemy)):
		cfg.erase("defense_intercept_pending")
		return false
	# Keep the selection while the camera pans between the defender and the contact.
	var result := RTSCommanderAI.issue_order([soldier.tag], "attack_target", Vector2.ZERO, plan.enemy)
	if result.ok:
		_commit_defense_intercept(cfg, soldier, plan.center, plan.radius_squared)
		cfg.erase("defense_intercept_pending")
		return true
	if not result.get("camera_pending", false):
		cfg.erase("defense_intercept_pending")
	return result.get("camera_pending", false)

func _commit_defense_intercept(cfg: Dictionary, soldier: Dictionary, center: Vector2, radius_squared: float) -> void:
	soldier.erase("skirmish_route")
	RTSCommanderAI.set_defense_intercept(soldier, center, radius_squared)
	cfg["counterattack_until"] = SimEngine.tick + 150 * SimEngine.TICK_RATE

func _can_intercept(soldier: Dictionary, enemy: Dictionary) -> bool:
	var reach: float = SimEngine.weapon_range_against(soldier, enemy) + soldier.radius + enemy.radius
	if soldier.flight_height > 0.0 or soldier.pos.distance_squared_to(enemy.pos) <= reach * reach:
		return true
	var path: Array[Vector2] = SimEngine.compute_smooth_path(soldier.pos, enemy.pos, soldier.radius, soldier.get("cliff_walk", false), reach)
	return path.back().distance_squared_to(enemy.pos) <= reach * reach

func _step_worker_scout(pid: int, cfg: Dictionary, workers: Array, base: Vector2) -> int:
	if SimEngine.vision == null or SimEngine.tick < WORKER_SCOUT_START_TICKS:
		return 0
	var mission: Dictionary = cfg.get("worker_scout", cfg.get("worker_scout_pending", {}))
	if mission.get("finished", false):
		return 0
	if mission.is_empty():
		if not _known_enemy_buildings(pid).is_empty() or SimEngine.tick >= WORKER_SCOUT_START_TICKS + WORKER_SCOUT_DURATION_TICKS:
			cfg["worker_scout"] = {"finished": true}
			return 0
		if workers.size() < WORKERS_BEFORE_SCOUT:
			return 0
		# The newest eligible miner is away from the front of the lists
		# used to assign gas workers and builders.
		for i in range(workers.size() - 1, -1, -1):
			var candidate: Dictionary = workers[i]
			if candidate.cargo_amount > 0 or candidate.orders.size() != 1 or candidate.orders[0].type != "harvest":
				continue
			var patch: Dictionary = SimEngine.resources.get(candidate.orders[0].target_tag, {})
			if patch.get("resource_type") != "crystal_field" or not SimEngine.deposit_present(patch):
				continue
			mission = {"tag": candidate.tag, "home_patch": patch.tag, "attempted": {},
				"deadline": SimEngine.tick + WORKER_SCOUT_DURATION_TICKS, "health": candidate.hp + candidate.shields}
			cfg["worker_scout_pending"] = mission
			break
		if mission.is_empty():
			return 0
	var worker: Dictionary = SimEngine.units.get(mission.tag, {})
	if worker.is_empty():
		mission["finished"] = true
		return 0
	var site: Vector2 = mission.get("site", Vector2.INF)
	if not mission.get("returning", false) and site.is_finite() and mission.get("inspected_site", Vector2.INF) != site and SimEngine.can_see_position(pid, site):
		if not RTSCommanderAI.look_at(pid, site):
			return worker.tag
		mission["inspected_site"] = site
	var health: float = worker.hp + worker.shields
	if mission.get("returning", false) or SimEngine.tick >= int(mission.deadline) or health < float(mission.health) or not _known_enemy_buildings(pid).is_empty() or _worker_scout_sees_threat(pid, worker):
		_return_worker_scout(worker, mission, base)
		return 0 if mission.finished else worker.tag
	mission.health = health
	if site.is_finite() and SimEngine.vision.last_seen_at(pid, site) == 0 and not worker.orders.is_empty() and worker.orders[0].type == "move":
		if SimEngine.tick < int(mission.check_tick):
			return worker.tag
		if worker.pos.distance_squared_to(mission.position) >= ROUTE_CHECK_DISTANCE_SQUARED:
			mission.position = worker.pos
			mission.check_tick = SimEngine.tick + ROUTE_CHECK_TICKS
			return worker.tag
	if site.is_finite():
		mission.attempted[site] = true
	elif worker.cargo_amount > 0:
		return worker.tag
	if _send_worker_scout(pid, worker, mission):
		if mission.has("site"):
			cfg["worker_scout"] = mission
			cfg.erase("worker_scout_pending")
		return worker.tag
	_return_worker_scout(worker, mission, base)
	return 0 if mission.finished else worker.tag

func _worker_scout_sees_threat(pid: int, worker: Dictionary) -> bool:
	for enemy in SimEngine.query_units_in_radius(worker.pos, 9.0, pid):
		if enemy.owner != 0 and not enemy.is_worker and RTSCommanderAI.sees_enemy(pid, enemy) and SimEngine.can_attack(enemy, worker):
			return true
	return false

func _send_worker_scout(pid: int, worker: Dictionary, mission: Dictionary) -> bool:
	var sites: Array[Vector2] = []
	for entry in SimEngine.match_state.get("starts", []):
		var site := Vector2(entry.x, entry.y)
		if not mission.attempted.has(site) and SimEngine.vision.last_seen_at(pid, site) == 0:
			sites.append(site)
	var from: Vector2 = worker.pos
	sites.sort_custom(func(a, b): return from.distance_squared_to(a) < from.distance_squared_to(b))
	var reveal_distance := maxf(3.0, float(worker.sight_range) - 4.0)
	for site in sites:
		# Scout the site from an approach point. The site's center can be a
		# foundation, and a partial route can still reach viewing distance.
		var approach := (from - site).normalized() * minf(9.0, reveal_distance)
		for angle in [0.0, PI / 3.0, -PI / 3.0, PI * 0.5, -PI * 0.5]:
			var point := site + approach.rotated(angle)
			var path: Array[Vector2] = SimEngine.compute_smooth_path(from, point, worker.radius)
			var destination: Vector2 = path.back()
			if destination.distance_squared_to(site) <= reveal_distance * reveal_distance and from.distance_squared_to(destination) > 4.0:
				var result := RTSCommanderAI.issue_order([worker.tag], "move", destination)
				if result.get("camera_pending", false):
					return true
				if result.ok:
					mission["site"] = site
					mission["position"] = from
					mission["check_tick"] = SimEngine.tick + ROUTE_CHECK_TICKS
					return true
		mission.attempted[site] = true
	return false

func _return_worker_scout(worker: Dictionary, mission: Dictionary, base: Vector2) -> void:
	mission["returning"] = true
	var patch: Dictionary = SimEngine.resources.get(mission.home_patch, {})
	if patch.is_empty() or not SimEngine.deposit_present(patch):
		patch = SimEngine._find_nearest_crystal(base)
	var result: Dictionary
	if not patch.is_empty() and SimEngine.can_see_position(worker.owner, patch.pos):
		result = RTSCommanderAI.issue_order([worker.tag], "harvest", patch.pos, patch.tag)
	else:
		result = RTSCommanderAI.issue_order([worker.tag], "move", base)
	mission["finished"] = not result.get("camera_pending", false)

func _scout_position(pid: int, from: Vector2, cfg: Dictionary, avoid: Vector2 = Vector2.INF) -> Vector2:
	var rerouting := avoid.is_finite()
	var previous: Vector2 = cfg.get("scout_position", Vector2.ZERO)
	if not rerouting and previous != Vector2.ZERO and SimEngine.vision.last_seen_at(pid, previous) == cfg.get("scout_seen", -1):
		return previous
	var best := Vector2.ZERO
	var best_seen := 2147483647
	var best_distance := INF
	# Check plausible bases first, without reading which start the opponent got.
	var sites: Array = SimEngine.match_state.get("starts", []) + SimEngine.match_state.get("expansions", [])
	for site in sites:
		var pos := Vector2(site.x, site.y)
		if rerouting and pos.distance_squared_to(avoid) < 16.0:
			continue
		var seen: int = SimEngine.vision.last_seen_at(pid, pos)
		var distance := from.distance_squared_to(pos)
		if seen < best_seen or (seen == best_seen and distance < best_distance):
			best = pos
			best_seen = seen
			best_distance = distance
	# Once the starts are checked, sweep walkable areas for off-site buildings.
	if best_seen > 0:
		for y in range(8, int(SimEngine.map_height), 20):
			for x in range(8, int(SimEngine.map_width), 20):
				var pos := Vector2(x, y)
				if rerouting and pos.distance_squared_to(avoid) < 16.0:
					continue
				var cell := Vector2i(pos / SimEngine.PATH_CELL_SIZE)
				if SimEngine.can_see_position(pid, pos) and SimEngine.astar_grid.is_point_solid(cell):
					continue
				var seen: int = SimEngine.vision.last_seen_at(pid, pos)
				var distance := from.distance_squared_to(pos)
				if seen < best_seen or (seen == best_seen and distance < best_distance):
					best = pos
					best_seen = seen
					best_distance = distance
	if not rerouting:
		cfg["scout_position"] = best
		cfg["scout_seen"] = best_seen
	return best

func _route_has_stalled(soldier: Dictionary, route: Dictionary) -> bool:
	var blocked: bool = route.get("blocked_pursuit", false)
	if not blocked and SimEngine.tick < int(route.check_tick):
		return false
	var position: Vector2 = soldier.pos
	var stalled: bool = position.distance_squared_to(route.position) < ROUTE_CHECK_DISTANCE_SQUARED
	route.position = position
	route.check_tick = SimEngine.tick + ROUTE_CHECK_TICKS
	return (blocked or stalled) and soldier.attack_state == "idle" and soldier.weapon_cooldown <= 0.0

func _recovery_destination(soldier: Dictionary, goal: Vector2, reach: float, previous: Vector2) -> Vector2:
	if soldier.flight_height > 0.0:
		return goal
	var from: Vector2 = soldier.pos
	var cliff_walk: bool = soldier.get("cliff_walk", false)
	if previous.is_finite():
		# A route that was already tried can still be jammed. Prefer a different
		# authored crossing that advances toward the objective.
		var crossings: Array[Vector2] = []
		var direction := (goal - from).normalized()
		for bridge in SimEngine.land_bridges:
			var point: Vector2 = bridge.get_center()
			if (point - from).dot(direction) >= 4.0 and point.distance_squared_to(previous) > 36.0:
				crossings.append(point)
		crossings.sort_custom(func(a, b): return from.distance_to(a) + a.distance_to(goal) < from.distance_to(b) + b.distance_to(goal))
		for i in range(mini(3, crossings.size())):
			var point := crossings[i]
			var path: Array[Vector2] = SimEngine.compute_smooth_path(from, point, soldier.radius, cliff_walk)
			if path.back().distance_squared_to(point) < 4.0:
				return path.back()
	var path: Array[Vector2] = SimEngine.compute_smooth_path(from, goal, soldier.radius, cliff_walk, reach if reach > 3.0 else INF)
	var destination: Vector2 = path.back()
	if destination.distance_to(goal) <= reach and from.distance_squared_to(destination) > 4.0:
		return destination
	return Vector2.INF

func _available_for_front(soldier: Dictionary) -> bool:
	if soldier.is_immobile or soldier.flight_height > 0.0 or soldier.attack_state != "idle" or soldier.weapon_cooldown > 0.0:
		return false
	if soldier.orders.is_empty():
		return true
	var order: Dictionary = soldier.orders[0]
	return order.type == "attack_move" and order.target_pos == soldier.get("skirmish_route", {}).get("destination", Vector2.INF)

func _attack_fronts(pid: int, army: Array, cfg: Dictionary, known: Array, desperate: bool) -> Dictionary:
	var fronts := {}
	if cfg.get("difficulty") != "hard" or desperate:
		return fronts
	var previous: Array = cfg.get("attack_fronts", [])
	for target in known:
		if target.tag in previous:
			fronts[target.tag] = target
	if fronts.size() == 2 or army.size() < MIN_SPLIT_ARMY or SimEngine.tick < int(cfg.get("front_retry_tick", 0)):
		return fronts
	var visible: Array = known.filter(func(target):
		var live: Dictionary = SimEngine.units.get(target.tag, {})
		return not live.is_empty() and RTSCommanderAI.sees_enemy(pid, live))
	if visible.size() < 2:
		return fronts
	var available := army.filter(_available_for_front)
	if available.size() < MIN_SPLIT_ARMY:
		return fronts
	cfg["front_retry_tick"] = SimEngine.tick + ROUTE_CHECK_TICKS
	var center := Vector2.ZERO
	for soldier in available:
		center += soldier.pos
	center /= float(available.size())
	available.sort_custom(func(a, b): return center.distance_squared_to(a.pos) < center.distance_squared_to(b.pos))
	var lead: Dictionary = available[0]
	visible.sort_custom(func(a, b): return center.distance_squared_to(a.pos) < center.distance_squared_to(b.pos))
	var probes := 0
	var options: Array[Dictionary] = []
	for target in visible:
		if options.any(func(option): return target.pos.distance_squared_to(option.target.pos) < FRONT_SPACING * FRONT_SPACING):
			continue
		probes += 1
		var route := _front_approach(lead, target)
		if not route.is_empty():
			for option in options:
				if _independent_front_routes(option, route):
					cfg["attack_fronts"] = [option.target.tag, target.tag]
					return {option.target.tag: option.target, target.tag: target}
			options.append(route)
		if probes >= MAX_FRONT_PROBES:
			break
	return fronts

func _front_approach(soldier: Dictionary, target: Dictionary) -> Dictionary:
	var from: Vector2 = soldier.pos
	var reach := _attack_reach(soldier, target)
	var path: Array[Vector2] = SimEngine.compute_smooth_path(from, target.pos, soldier.radius, soldier.get("cliff_walk", false), reach)
	if path.back().distance_squared_to(target.pos) > reach * reach:
		return {}
	var bridge := -1
	var advance: Vector2 = path.back()
	var remaining := FRONT_SPACING
	for point in path:
		if bridge < 0:
			for i in range(SimEngine.land_bridges.size()):
				if SimEngine._walk_segment_enters_rect(from, point, SimEngine.land_bridges[i]):
					bridge = i
					break
		if remaining > 0.0:
			var length := from.distance_to(point)
			if length >= remaining:
				advance = from.lerp(point, remaining / length)
			remaining -= length
		from = point
	return {"target": target, "bridge": bridge, "advance": advance}

func _independent_front_routes(a: Dictionary, b: Dictionary) -> bool:
	# Separate authored crossings are distinct even when the army starts
	# far away. Open approaches must diverge near the army.
	if a.bridge >= 0 and b.bridge >= 0:
		return a.bridge != b.bridge
	return a.advance.distance_squared_to(b.advance) >= 12.0 * 12.0

func _attack_reach(soldier: Dictionary, target: Dictionary) -> float:
	return maxf(3.0, SimEngine.weapon_range_against(soldier, target) + soldier.radius + target.radius)

func _choose_front(pid: int, soldier: Dictionary, fronts: Dictionary, loads: Dictionary, previous: int, skipped: Array) -> Dictionary:
	if previous not in skipped and fronts.has(previous):
		return fronts[previous]
	if fronts.is_empty() or not _available_for_front(soldier):
		return {}
	var best := {}
	var best_load := 2147483647
	var best_distance := INF
	for tag in fronts:
		if tag in skipped:
			continue
		var target: Dictionary = fronts[tag]
		if not SimEngine.can_see_position(pid, target.pos):
			continue
		var load_count: int = loads[tag]
		var distance: float = soldier.pos.distance_squared_to(target.pos)
		if load_count < best_load or (load_count == best_load and distance < best_distance):
			best = target
			best_load = load_count
			best_distance = distance
	return best

func _attack(pid: int, army: Array, cfg: Dictionary, desperate: bool) -> void:
	var threshold = {"rush": 6, "balanced": 10, "siege": 12, "economy": 18}[str(cfg.get("strategy", "balanced"))]
	if cfg.get("difficulty", "normal") == "easy":
		threshold += 6
	if SimEngine.tick < int(cfg.get("counterattack_until", 0)):
		threshold = mini(threshold, 10)
	if army.size() < threshold and not desperate and not bool(cfg.get("attacking", false)):
		return
	cfg["attacking"] = true
	if SimEngine.ladder_rules and SimEngine.players[pid].faction == RTSData.FACTION_ALIENS:
		_try_archon_fusion(pid, army)
	var known := _known_enemy_buildings(pid)
	var fronts := _attack_fronts(pid, army, cfg, known, desperate)
	var loads := {}
	for tag in fronts:
		loads[tag] = 0
	if not fronts.is_empty():
		for soldier in army:
			var tag: int = soldier.get("skirmish_route", {}).get("front_tag", 0)
			if loads.has(tag):
				loads[tag] += 1
	var recoveries := 0
	for soldier in army:
		if not soldier.orders.is_empty() and soldier.orders[0].type == "enter_brood_tunnel":
			if SimEngine.tick < int(soldier.get("skirmish_tunnel_until", SimEngine.tick)):
				continue
			RTSCommanderAI.issue_order([soldier.tag], "stop")
			soldier.erase("skirmish_tunnel_until")
		if soldier.unit_type == "locust_brooder":
			_try_locust_launch(pid, soldier)
		if soldier.is_immobile:
			continue
		if soldier.unit_type == "ridge_scout":
			_try_ridge_charge(pid, soldier)
		if soldier.unit_type == "skirmisher" and _try_defensive_phase_step(pid, soldier):
			continue
		if soldier.unit_type == "duskblade" and _try_defensive_phase_step(pid, soldier, "shadow_stride"):
			continue
		if soldier.unit_type == "mirage_adept":
			_try_defensive_mirage_transfer(pid, soldier)
		if soldier.unit_type == "blight_hurler" and _try_hurler_lunge(pid, soldier):
			continue
		if soldier.unit_type == "rift_engine" and _try_rift_nova(pid, soldier):
			continue
		if soldier.unit_type == "storm_scribe":
			_try_scribe_spell(pid, soldier)
		if soldier.unit_type == "aegis_warden":
			_try_guardian_shield(pid, soldier)
		if soldier.unit_type == "rupture_crawler":
			_try_caustic_barrage(pid, soldier)
		if soldier.unit_type == "corrosion_flyer":
			_try_caustic_spray(pid, soldier)
		if soldier.unit_type == "mireweaver":
			_try_mireweaver_spell(pid, soldier)
		if soldier.unit_type == "siphon_wyrm" and _try_wyrm_spell(pid, soldier):
			continue
		if soldier.unit_type in ["dawn_interceptor", "prism_ray"] and _try_concord_air_spell(pid, soldier):
			continue
		if soldier.unit_type == "sunseer" and _try_sunseer_spell(pid, soldier):
			continue
		if soldier.unit_type == "crownspire" and _try_flagship_spell(pid, soldier):
			continue
		if soldier.unit_type == "shade_agent" and _try_agent_spell(pid, soldier):
			continue
		if SimEngine.ladder_rules and soldier.unit_type in ["kestrel_interceptor", "kestrel_assault", "rampart_transport",
				"night_harrier", "sky_sentry", "sky_sentry_defender", "watchkeeper", "dreadnought"] and _try_airframe_micro(pid, soldier):
			continue
		if soldier.unit_type in ["cinder_runner", "cinder_guard", "sentinel_mine", "sentinel_mine_armed",
				"atlas_walker", "atlas_walker_precision", "vortex_rover"] and _try_workshop_micro(pid, soldier):
			continue
		if soldier.flight_height > 0.0 and not RTSData.get_unit_def(soldier.unit_type).get("weapon", {}).get("targets_ground", true):
			continue
		var route: Dictionary = soldier.get("skirmish_route", {})
		var previous_front: int = route.get("front_tag", 0)
		var skipped_fronts: Array = route.get("abandoned_fronts", []) if route.get("abandoned_revision", -1) == SimEngine._navigation_revision else []
		var closest := _choose_front(pid, soldier, fronts, loads, previous_front, skipped_fronts)
		var front_tag: int = closest.get("tag", 0)
		var recovering := false
		var found_target: bool = route.get("searching", false) and not known.is_empty()
		var change_goal := found_target or previous_front != front_tag
		if not soldier.orders.is_empty():
			var order: Dictionary = soldier.orders.front()
			if route.is_empty() or order.type != "attack_move" or order.target_pos != route.destination:
				continue
			recovering = not change_goal and _route_has_stalled(soldier, route)
			if not recovering and not change_goal:
				continue
		elif not route.is_empty():
			recovering = not change_goal and soldier.pos.distance_squared_to(route.destination) > 9.0
		if recovering and recoveries >= MAX_RECOVERIES_PER_UPDATE:
			continue
		if not change_goal and SimEngine.tick < int(route.get("retry_tick", 0)):
			continue
		if closest.is_empty():
			var distance := INF
			for enemy in known:
				if enemy.tag in skipped_fronts:
					continue
				var candidate_distance: float = soldier.pos.distance_squared_to(enemy.pos)
				if candidate_distance < distance:
					closest = enemy
					distance = candidate_distance
		var goal := Vector2.ZERO
		var reach := 3.0
		if not closest.is_empty():
			goal = closest.pos
			reach = _attack_reach(soldier, closest)
		elif SimEngine.vision != null:
			goal = _scout_position(pid, soldier.pos, cfg)
		if goal == Vector2.ZERO:
			if previous_front != 0 and not skipped_fronts.is_empty():
				RTSCommanderAI.issue_order([soldier.tag], "stop")
				route.erase("front_tag")
			continue
		var destination := goal
		if recovering:
			recoveries += 1
			var previous: Vector2 = route.destination if route.get("recovery", false) else Vector2.INF
			destination = _recovery_destination(soldier, goal, reach, previous)
			if not destination.is_finite() and front_tag != 0:
				# A split unit can regroup on the other front instead of
				# repeatedly retrying a route cut by new terrain or structures.
				skipped_fronts.append(front_tag)
				route["abandoned_fronts"] = skipped_fronts
				route["abandoned_revision"] = SimEngine._navigation_revision
				continue
			if not destination.is_finite() and SimEngine.vision != null:
				var scout := _scout_position(pid, soldier.pos, cfg, goal)
				if scout != Vector2.ZERO:
					destination = _recovery_destination(soldier, scout, 3.0, Vector2.INF)
			if not destination.is_finite():
				route.retry_tick = SimEngine.tick + ROUTE_CHECK_TICKS
				continue
		if RTSCommanderAI.issue_order([soldier.tag], "attack_move", destination, 0, "", false, recovering or front_tag != 0).ok:
			if loads.has(previous_front):
				loads[previous_front] -= 1
			if front_tag != 0:
				loads[front_tag] += 1
			RTSCommanderAI.set_attack_arrival(soldier)
			soldier["skirmish_route"] = {
				"destination": destination, "position": soldier.pos, "recovery": recovering,
				"check_tick": SimEngine.tick + ROUTE_CHECK_TICKS, "searching": closest.is_empty(),
				"front_tag": front_tag, "abandoned_fronts": skipped_fronts, "abandoned_revision": SimEngine._navigation_revision,
			}

func _try_ridge_charge(pid: int, scout: Dictionary) -> void:
	if not RTSCommanderAI.is_on_camera(pid, scout.pos) or SimEngine.ridge_charge_remaining(scout) > 0.0:
		return
	var radius: float = SimEngine.RIDGE_CHARGE_RADIUS
	var visible: Array[Dictionary] = SimEngine.query_units_in_radius(scout.pos, SimEngine.RIDGE_CHARGE_RANGE).filter(
		func(unit): return unit.owner > 0 and RTSCommanderAI.is_on_camera(pid, unit.pos) and SimEngine.can_see_unit(pid, unit))
	for target in visible:
		if target.owner == pid or target.is_structure or target.flight_height > 0.0:
			continue
		if scout.pos.distance_squared_to(target.pos) > SimEngine.RIDGE_CHARGE_RANGE * SimEngine.RIDGE_CHARGE_RANGE:
			continue
		var enemies := 0
		for nearby in visible:
			if nearby.is_structure or nearby.flight_height > 0.0 or nearby.pos.distance_squared_to(target.pos) > radius * radius:
				continue
			enemies += -2 if nearby.owner == pid else 1
		if enemies >= 3 and RTSCommanderAI.issue_order([scout.tag], "ridge_charge", target.pos).ok:
			return

func _try_defensive_phase_step(pid: int, soldier: Dictionary, ability: String = "phase_step") -> bool:
	if not SimEngine.ladder_rules or soldier.shields > 10.0 or soldier.phase_cooldown > 0.0 \
			or not SimEngine.players[pid].upgrades.get(ability, 0) or not RTSCommanderAI.is_on_camera(pid, soldier.pos):
		return false
	var retreat := _visible_retreat_direction(pid, soldier)
	if retreat.is_zero_approx():
		return false
	for offset in [0.0, 0.52, -0.52]:
		var point: Vector2 = soldier.pos + retreat.normalized().rotated(offset) * 15.0
		if RTSCommanderAI.is_on_camera(pid, point) and RTSCommanderAI.issue_order([soldier.tag], ability, point).ok:
			return true
	return false

func _try_archon_fusion(pid: int, army: Array) -> void:
	var candidates := army.filter(func(unit):
		return SimEngine.can_merge_archon_unit(unit) and RTSCommanderAI.is_on_camera(pid, unit.pos) \
			and (unit.energy < 25.0 if unit.unit_type == "storm_scribe" else unit.shields < 25.0))
	if candidates.size() >= 2 and candidates[0].pos.distance_squared_to(candidates[1].pos) <= 12.0 ** 2:
		RTSCommanderAI.issue_order([candidates[0].tag, candidates[1].tag], "merge_archon")

func _try_defensive_mirage_transfer(pid: int, adept: Dictionary) -> void:
	if adept.shields > 20.0 or SimEngine.mirage_transfer_ticks(adept) > 0 or not RTSCommanderAI.is_on_camera(pid, adept.pos):
		return
	var retreat := _visible_retreat_direction(pid, adept)
	if retreat.is_zero_approx():
		return
	for offset in [0.0, 0.52, -0.52]:
		var point: Vector2 = adept.pos + retreat.normalized().rotated(offset) * 17.0
		if (RTSCommanderAI.is_on_camera(pid, point) and SimEngine.can_see_position(pid, point)
				and SimEngine._has_clear_line_of_walk(adept.pos, point, adept.radius)
				and RTSCommanderAI.issue_order([adept.tag], "mirage_transfer", point).ok):
			return

func _visible_retreat_direction(pid: int, soldier: Dictionary) -> Vector2:
	var retreat := Vector2.ZERO
	for threat in SimEngine.query_units_in_radius(soldier.pos, 14.0, pid):
		if (threat.owner > 0 and RTSCommanderAI.is_on_camera(pid, threat.pos)
				and SimEngine.can_see_unit(pid, threat) and SimEngine.can_attack(threat, soldier)):
			retreat += (soldier.pos - threat.pos).normalized()
	return retreat

func _try_hurler_lunge(pid: int, hurler: Dictionary) -> bool:
	if hurler.hp >= hurler.max_hp * 0.45 or not RTSCommanderAI.is_on_camera(pid, hurler.pos) \
			or not SimEngine.hurler_lunge_block_reason(hurler).is_empty():
		return false
	var retreat := _visible_retreat_direction(pid, hurler)
	if retreat.is_zero_approx():
		return false
	for offset in [0.0, 0.52, -0.52]:
		var point: Vector2 = hurler.pos + retreat.normalized().rotated(offset) * 13.0
		if RTSCommanderAI.is_on_camera(pid, point) and SimEngine.can_see_position(pid, point) \
				and SimEngine._has_clear_line_of_walk(hurler.pos, point, hurler.radius) \
				and RTSCommanderAI.issue_order([hurler.tag], "hurler_lunge", point).ok:
			return true
	return false

func _use_spore_seer(pid: int, mine: Array, counts: Dictionary, response: Dictionary, base: Vector2) -> void:
	for unit in mine:
		if unit.unit_type != "spore_seer":
			continue
		if response.get("detection_alert", false) and unit.orders.is_empty() and unit.pos.distance_squared_to(response.detector_site) > 64.0:
			RTSCommanderAI.issue_order([unit.tag], "move", response.detector_site)
		if unit.energy >= LadderRules.CONTAMINATE_COST and RTSCommanderAI.is_on_camera(pid, unit.pos):
			for target in SimEngine.query_units_in_radius(unit.pos, LadderRules.CONTAMINATE_RANGE + 4.0, pid):
				if target.is_structure and SimEngine.can_see_unit(pid, target) and RTSCommanderAI.is_on_camera(pid, target.pos) \
						and RTSCommanderAI.issue_order([unit.tag], "contaminate_production", target.pos, target.tag).ok:
					break
	var detectors: int = int(counts.get("spore_seer", 0)) + int(counts.get("seer_cocoon", 0))
	if detectors > 0 or (response.detector.is_empty() and SimEngine.sim_time < 360.0):
		return
	var sacs := mine.filter(func(unit): return unit.unit_type == "drift_sac")
	sacs.sort_custom(func(a, b): return a.pos.distance_squared_to(base) < b.pos.distance_squared_to(base))
	for sac in sacs:
		if SimEngine.brood_morph_block_reason(sac, "spore_seer").is_empty():
			RTSCommanderAI.issue_order([sac.tag], "morph_spore_seer")
			return

func _try_spine_ambush(pid: int, ambusher: Dictionary) -> bool:
	if ambusher.has("burrow_transition"):
		return false
	var buried: bool = ambusher.get("burrowed", false)
	var review_tick: int = ambusher.get("ai_burrow_review_tick", 0)
	if not RTSCommanderAI.is_on_camera(pid, ambusher.pos):
		if buried and SimEngine.tick >= review_tick:
			RTSCommanderAI.look_at(pid, ambusher.pos)
		return false
	var reach := 20.0 + float(ambusher.radius)
	for enemy in SimEngine.query_units_in_radius(ambusher.pos, reach):
		if enemy.owner <= 0 or enemy.owner == pid or enemy.flight_height > 0.0 \
				or not RTSCommanderAI.is_on_camera(pid, enemy.pos) or not SimEngine.can_see_unit(pid, enemy):
			continue
		if buried:
			ambusher["ai_burrow_review_tick"] = SimEngine.tick + SimEngine.TICK_RATE * 8
			return false
		if RTSCommanderAI.issue_order([ambusher.tag], "burrow").ok:
			ambusher["ai_burrow_review_tick"] = SimEngine.tick + SimEngine.TICK_RATE * 8
			return true
	if buried and SimEngine.tick >= review_tick:
		return RTSCommanderAI.issue_order([ambusher.tag], "surface").ok
	return false

func _try_crawler_burrow(pid: int, crawler: Dictionary) -> bool:
	if crawler.has("burrow_transition"):
		return false
	var buried: bool = crawler.get("burrowed", false)
	if not RTSCommanderAI.is_on_camera(pid, crawler.pos):
		if buried and SimEngine.tick >= int(crawler.get("ai_burrow_review_tick", SimEngine.tick + 1)):
			RTSCommanderAI.look_at(pid, crawler.pos)
		return false
	var nearby_threat := false
	var detector := false
	for enemy in SimEngine.query_units_in_radius(crawler.pos, 22.5):
		if enemy.owner <= 0 or enemy.owner == pid or not RTSCommanderAI.is_on_camera(pid, enemy.pos) \
				or not SimEngine.can_see_unit(pid, enemy):
			continue
		nearby_threat = nearby_threat or SimEngine.can_attack(enemy, crawler)
		detector = detector or float(enemy.get("detection_radius", 0.0)) > 0.0
	if buried:
		return (detector or crawler.hp >= crawler.max_hp * 0.85) \
			and RTSCommanderAI.issue_order([crawler.tag], "surface").ok
	if crawler.hp >= crawler.max_hp * 0.35 or detector or not nearby_threat:
		return false
	if not RTSCommanderAI.issue_order([crawler.tag], "burrow").ok:
		return false
	crawler["ai_burrow_review_tick"] = SimEngine.tick + SimEngine.TICK_RATE * 16
	return true

func _try_caustic_barrage(pid: int, crawler: Dictionary) -> void:
	if SimEngine.caustic_barrage_ticks(crawler) > 0 or not RTSCommanderAI.is_on_camera(pid, crawler.pos):
		return
	var radius := SimEngine.caustic_barrage_radius()
	var contacts: Array[Dictionary] = SimEngine.query_units_in_radius(crawler.pos, LadderRules.CAUSTIC_BARRAGE_RANGE + radius)
	var visible := contacts.filter(func(unit):
		return not unit.get("nonblocking", false) and RTSCommanderAI.is_on_camera(pid, unit.pos) and SimEngine.can_see_unit(pid, unit))
	for target in visible:
		if target.owner == pid or (target.owner == 0 and target.unit_type != "phase_barrier"):
			continue
		if crawler.pos.distance_squared_to(target.pos) > LadderRules.CAUSTIC_BARRAGE_RANGE ** 2:
			continue
		var hits := 0
		var unsafe := false
		for unit in visible:
			if unit.pos.distance_squared_to(target.pos) <= (radius + unit.radius) ** 2:
				unsafe = unsafe or unit.owner == pid
				hits += int(unit.owner > 0 and unit.owner != pid)
		if not unsafe and (target.unit_type == "phase_barrier" or hits >= 2) \
				and RTSCommanderAI.issue_order([crawler.tag], "caustic_barrage", target.pos).ok:
			return

func _try_caustic_spray(pid: int, flyer: Dictionary) -> void:
	if not SimEngine.caustic_spray_ready(flyer) or not RTSCommanderAI.is_on_camera(pid, flyer.pos):
		return
	for target in SimEngine.query_units_in_radius(flyer.pos, LadderRules.CAUSTIC_SPRAY_RANGE + 4.0, pid):
		if target.is_structure and target.owner > 0 and RTSCommanderAI.is_on_camera(pid, target.pos) \
				and SimEngine.can_see_unit(pid, target) and RTSCommanderAI.issue_order([flyer.tag], "caustic_spray", target.pos, target.tag).ok:
			return

func _try_guardian_shield(pid: int, warden: Dictionary) -> void:
	if not RTSCommanderAI.is_on_camera(pid, warden.pos) or not SimEngine.guardian_shield_block_reason(warden).is_empty():
		return
	var allied := 0
	var under_ranged_threat := false
	for unit in SimEngine.query_units_in_radius(warden.pos, 23.0):
		if unit.is_structure or unit.get("nonblocking", false) or not RTSCommanderAI.is_on_camera(pid, unit.pos):
			continue
		if unit.owner == pid:
			if unit.tag != warden.tag and unit.pos.distance_squared_to(warden.pos) <= LadderRules.GUARDIAN_SHIELD_RADIUS ** 2:
				allied += 1
		elif unit.owner > 0 and SimEngine.can_see_unit(pid, unit) and SimEngine.can_attack(unit, warden):
			under_ranged_threat = under_ranged_threat or SimEngine.is_ranged_weapon(SimEngine._active_weapon(unit, warden))
	if allied >= 3 and under_ranged_threat:
		RTSCommanderAI.issue_order([warden.tag], "guardian_shield")

func _use_brood_tunnel(pid: int, own: Array, army: Array) -> void:
	var networks := own.filter(func(unit): return unit.unit_type == "tunnel_mouth" and unit.build_progress >= 1.0)
	if networks.is_empty():
		return
	var network: Dictionary = networks[0]
	var worms := own.filter(func(unit): return unit.unit_type == "brood_tunnel_worm")
	var cargo := SimEngine.brood_tunnel_cargo_count(network)
	if not worms.is_empty():
		var exit: Dictionary = worms[0]
		if exit.build_progress < 1.0:
			return
		if cargo >= 4 or exit.has("brood_tunnel_unload"):
			if not exit.has("brood_tunnel_unload"):
				RTSCommanderAI.issue_order([exit.tag], "unload_brood_tunnel")
			return
		var nearby := army.filter(func(unit):
			return (unit.pos.distance_squared_to(network.pos) <= 17.0 ** 2 and SimEngine.can_enter_brood_tunnel(unit, network)
				and (unit.orders.is_empty() or unit.orders[0].type != "enter_brood_tunnel")))
		if cargo > 0 and nearby.is_empty() and not army.any(func(unit):
			return not unit.orders.is_empty() and unit.orders[0].type == "enter_brood_tunnel"):
			RTSCommanderAI.issue_order([exit.tag], "unload_brood_tunnel")
		elif nearby.size() >= 4 - cargo:
			var tags := nearby.slice(0, mini(6, nearby.size())).map(func(unit): return unit.tag)
			if RTSCommanderAI.issue_order(tags, "enter_brood_tunnel", network.pos, network.tag).ok:
				for unit in nearby:
					if not unit.orders.is_empty() and unit.orders[0].type == "enter_brood_tunnel":
						unit["skirmish_tunnel_until"] = SimEngine.tick + 14 * SimEngine.TICK_RATE
		return
	if not SimEngine.brood_worm_block_reason(network).is_empty():
		return
	var site: Vector2 = network.get("skirmish_worm_site", Vector2.INF)
	if site.is_finite() and SimEngine.can_see_position(pid, site):
		var result := RTSCommanderAI.issue_order([network.tag], "summon_brood_worm", site)
		if result.ok or not result.get("camera_pending", false):
			network.erase("skirmish_worm_site")
		return
	network.erase("skirmish_worm_site")
	for enemy in SimEngine.units.values():
		if (not enemy.is_structure or not SimEngine.is_hostile_contact(pid, enemy)
				or enemy.pos.distance_squared_to(network.pos) < 70.0 ** 2
				or not SimEngine.can_see_unit(pid, enemy) or not RTSCommanderAI.is_on_camera(pid, enemy.pos)):
			continue
		var site_direction: Vector2 = enemy.pos.direction_to(network.pos)
		for angle in [0.0, 0.65, -0.65, 1.3, -1.3]:
			var point: Vector2 = enemy.pos + site_direction.rotated(angle) * 14.0
			if (RTSCommanderAI.is_on_camera(pid, point) and SimEngine.can_see_position(pid, point)
					and SimEngine.can_place_structure("brood_tunnel_worm", point)):
				network["skirmish_worm_site"] = point
				return

func _try_airframe_micro(pid: int, craft: Dictionary) -> bool:
	if craft.has("sky_transition") or craft.has("fighter_mode_until") or craft.has("dread_jump") or craft.has("dread_beam"):
		return true
	if craft.has("skirmish_jump_site"):
		var jump: Dictionary = RTSCommanderAI.issue_order([craft.tag], "dreadnought_jump", craft.skirmish_jump_site)
		if jump.ok or not jump.get("camera_pending", false):
			craft.erase("skirmish_jump_site")
		return true
	if not RTSCommanderAI.is_on_camera(pid, craft.pos):
		return craft.unit_type == "sky_sentry_defender"
	var contacts := SimEngine.query_units_in_radius(craft.pos, 24.0, pid).filter(func(unit):
		return (unit.hp > 0.0 and SimEngine.is_hostile_contact(pid, unit) and not unit.get("nonblocking", false)
			and RTSCommanderAI.is_on_camera(pid, unit.pos) and SimEngine.can_see_unit(pid, unit)))
	var flyers := contacts.filter(func(unit): return unit.flight_height > 0.0)
	var ground := contacts.filter(func(unit): return unit.flight_height <= 0.0 and not unit.is_structure)
	match craft.unit_type:
		"rampart_transport":
			if craft.hp < craft.max_hp * 0.5 and contacts.any(func(unit): return SimEngine.can_attack(unit, craft)):
				var retreat := _visible_retreat_direction(pid, craft)
				if not retreat.is_zero_approx() and SimEngine.rampart_boost_block_reason(craft).is_empty():
					RTSCommanderAI.issue_order([craft.tag], "rampart_boost")
					return RTSCommanderAI.issue_order([craft.tag], "move", craft.pos + retreat * 10.0).ok
			if craft.get("support_target_tag", 0) > 0:
				return true
			for ally in SimEngine.query_units_in_radius(craft.pos, 18.0):
				if RTSCommanderAI.is_on_camera(pid, ally.pos) and SimEngine.can_restore(craft, ally) and ally.hp < ally.max_hp * 0.65:
					return RTSCommanderAI.issue_order([craft.tag], "restore_vitals", ally.pos, ally.tag).ok
		"kestrel_interceptor":
			if flyers.is_empty() and ground.size() >= 2 and contacts.all(func(unit): return not unit.get("armed_structure", false)):
				if SimEngine.fighter_mode_block_reason(craft, "fighter_assault").is_empty():
					return RTSCommanderAI.issue_order([craft.tag], "fighter_assault").ok
		"kestrel_assault":
			if not flyers.is_empty() or ground.is_empty():
				return RTSCommanderAI.issue_order([craft.tag], "fighter_intercept").ok
		"night_harrier":
			if craft.get("cloaked", false) and (ground.is_empty() or craft.energy < 4.0):
				return RTSCommanderAI.issue_order([craft.tag], "harrier_cloak").ok
			if not craft.get("cloaked", false) and craft.energy >= 55.0 and not ground.is_empty():
				if SimEngine.harrier_cloak_block_reason(craft).is_empty():
					return RTSCommanderAI.issue_order([craft.tag], "harrier_cloak").ok
		"sky_sentry":
			if flyers.is_empty() and ground.size() >= 2 and not craft.orders.any(func(order): return order.type == "sky_defender_mode"):
				for target in ground:
					if target.pos.distance_squared_to(craft.pos) <= SimEngine.sky_deploy_range(craft) ** 2:
						return RTSCommanderAI.issue_order([craft.tag], "sky_defender_mode", target.pos).ok
		"sky_sentry_defender":
			var zone: Vector2 = craft.get("sky_zone", {}).get("pos", craft.pos)
			if RTSCommanderAI.is_on_camera(pid, zone) and not ground.any(func(unit): return SimEngine.can_attack(craft, unit)):
				RTSCommanderAI.issue_order([craft.tag], "sky_fighter_mode")
			return true
		"watchkeeper":
			return _try_watchkeeper_spell(pid, craft, contacts)
		"dreadnought":
			if craft.hp < craft.max_hp * 0.3 and not contacts.is_empty() and SimEngine.dreadnought_ability_block_reason(craft, "dreadnought_jump").is_empty():
				for base in SimEngine.units.values():
					if SimEngine.is_dropoff(base, pid) and base.pos.distance_squared_to(craft.pos) > 26.0 ** 2:
						craft["skirmish_jump_site"] = base.pos
						return true
			if SimEngine.dreadnought_ability_block_reason(craft, "dreadnought_beam").is_empty():
				for target in contacts:
					if target.hp + target.shields >= 200.0 and SimEngine._edge_distance(craft, target) <= LadderRules.DREADNOUGHT_BEAM_RANGE:
						return RTSCommanderAI.issue_order([craft.tag], "dreadnought_beam", target.pos, target.tag).ok
	return false

func _try_watchkeeper_spell(pid: int, craft: Dictionary, contacts: Array) -> bool:
	if craft.energy < 50.0 or SimEngine.systems_jammed(craft):
		return false
	if SimEngine.watchkeeper_spell_block_reason(craft, "systems_jammer").is_empty():
		for target in contacts:
			if not target.is_structure and (target.attributes.has("Mechanical") or target.attributes.has("Psionic")) \
					and (target.attributes.has("Massive") or target.energy >= 50.0):
				if RTSCommanderAI.issue_order([craft.tag], "systems_jammer", target.pos, target.tag).ok:
					return true
	if craft.energy >= 75.0:
		for target in contacts:
			if target.is_structure:
				continue
			var nearby := SimEngine.query_units_in_radius(target.pos, LadderRules.ARMOR_MISSILE_RADIUS)
			var hostile := nearby.filter(func(unit): return unit in contacts and not unit.is_structure)
			var friends := nearby.any(func(unit): return unit.owner == pid and RTSCommanderAI.is_on_camera(pid, unit.pos))
			if hostile.size() >= 3 and not friends and RTSCommanderAI.issue_order([craft.tag], "armor_breaker", target.pos, target.tag).ok:
				return true
	if not contacts.is_empty() and craft.energy >= 50.0:
		var point: Vector2 = craft.pos + craft.pos.direction_to(contacts[0].pos) * 4.5
		if SimEngine.can_place_structure("bastion_turret", point):
			return RTSCommanderAI.issue_order([craft.tag], "deploy_bastion_turret", point).ok
	return false

func _try_workshop_micro(pid: int, vehicle: Dictionary) -> bool:
	if vehicle.has("vehicle_transition"):
		return true
	if not RTSCommanderAI.is_on_camera(pid, vehicle.pos):
		return vehicle.unit_type == "sentinel_mine_armed"
	var contacts := SimEngine.query_units_in_radius(vehicle.pos, 23.0, pid).filter(func(unit):
		return (unit.hp > 0.0 and SimEngine.is_hostile_contact(pid, unit) and not unit.get("nonblocking", false)
			and RTSCommanderAI.is_on_camera(pid, unit.pos) and SimEngine.can_see_unit(pid, unit)))
	var close_ground := contacts.filter(func(unit): return unit.flight_height <= 0.0 and SimEngine._edge_distance(vehicle, unit) <= 7.5)
	var mode := ""
	match vehicle.unit_type:
		"cinder_runner":
			if close_ground.size() >= 3:
				mode = "cinder_guard_mode"
		"cinder_guard":
			if close_ground.is_empty():
				mode = "cinder_runner_mode"
		"sentinel_mine":
			if contacts.size() >= 2 and int(vehicle.get("mine_ready", 0)) <= SimEngine.tick:
				mode = "mine_burrow"
		"sentinel_mine_armed":
			if contacts.is_empty() and not vehicle.has("mine_target"):
				mode = "mine_surface"
			if mode.is_empty():
				return true
		"atlas_walker", "atlas_walker_precision":
			var aircraft := contacts.filter(func(unit): return unit.flight_height > 0.0)
			var massive := aircraft.any(func(unit): return unit.attributes.has("Massive"))
			if massive and vehicle.unit_type == "atlas_walker":
				mode = "atlas_precision_mode"
			elif aircraft.size() >= 2 and not massive and vehicle.unit_type == "atlas_walker_precision":
				mode = "atlas_airburst_mode"
		"vortex_rover":
			if SimEngine.vortex_lock_block_reason(vehicle).is_empty():
				for unit in contacts:
					if (unit.is_structure or unit.attributes.has("Armored")) and SimEngine._edge_distance(vehicle, unit) <= LadderRules.VORTEX_LOCK_RANGE:
						if RTSCommanderAI.issue_order([vehicle.tag], "vortex_lock", unit.pos, unit.tag).ok:
							return true
	if mode.is_empty() or not SimEngine.vehicle_mode_block_reason(vehicle, mode).is_empty():
		return vehicle.unit_type == "sentinel_mine_armed"
	return RTSCommanderAI.issue_order([vehicle.tag], mode).ok

func _try_agent_spell(pid: int, agent: Dictionary) -> bool:
	if not RTSCommanderAI.is_on_camera(pid, agent.pos):
		return false
	var contacts := SimEngine.query_units_in_radius(agent.pos, LadderRules.AGENT_STRIKE_RANGE, pid).filter(func(unit):
		return (unit.hp > 0.0 and SimEngine.is_hostile_contact(pid, unit) and not unit.get("nonblocking", false)
			and RTSCommanderAI.is_on_camera(pid, unit.pos) and SimEngine.can_see_unit(pid, unit)))
	if not SimEngine._ready_tactical_charge(pid).is_empty():
		for target in contacts:
			if not target.is_structure or target.pos.distance_squared_to(agent.pos) < 22.0 ** 2:
				continue
			var clustered := contacts.filter(func(unit): return unit.is_structure and unit.pos.distance_squared_to(target.pos) <= 10.0 ** 2)
			if clustered.size() >= 3 and RTSCommanderAI.issue_order([agent.tag], "agent_strike", target.pos).ok:
				return true
	if agent.energy >= LadderRules.AGENT_EMP_COST:
		var vulnerable := contacts.filter(func(unit): return unit.shields >= 25.0 or unit.energy >= 50.0)
		for target in vulnerable:
			var nearby := vulnerable.filter(func(unit): return unit.pos.distance_squared_to(target.pos) <= LadderRules.AGENT_EMP_RADIUS ** 2)
			if nearby.size() >= 3 and RTSCommanderAI.issue_order([agent.tag], "agent_emp", target.pos).ok:
				return true
	if agent.energy >= LadderRules.AGENT_SNIPE_COST:
		for target in contacts:
			if target.attributes.has("Psionic") or target.attributes.has("Massive"):
				if SimEngine._valid_agent_snipe_target(agent, target, LadderRules.AGENT_SNIPE_RANGE) \
						and RTSCommanderAI.issue_order([agent.tag], "agent_snipe", target.pos, target.tag).ok:
					return true
	if not contacts.is_empty() and not agent.get("cloaked", false) and agent.energy >= 100.0 \
			and SimEngine.agent_spell_block_reason(agent, "agent_cloak").is_empty():
		return RTSCommanderAI.issue_order([agent.tag], "agent_cloak").ok
	return false

func _try_sunseer_spell(pid: int, scout: Dictionary) -> bool:
	if not RTSCommanderAI.is_on_camera(pid, scout.pos):
		return false
	var contacts := SimEngine.query_units_in_radius(scout.pos, LadderRules.REVELATION_RANGE, pid).filter(func(unit):
		return (unit.hp > 0.0 and SimEngine.is_hostile_contact(pid, unit) and not unit.get("nonblocking", false)
			and RTSCommanderAI.is_on_camera(pid, unit.pos) and SimEngine.can_see_unit(pid, unit)))
	if not SimEngine.sunseer_spell_block_reason(scout, "revelation").is_empty():
		if scout.get("pulsar_active", false) and (contacts.is_empty() or scout.energy < 7.0):
			return RTSCommanderAI.issue_order([scout.tag], "end_pulsar_beam").ok
	else:
		for contact in contacts:
			if (contact.get("cloaked", false) or contact.get("burrowed", false)) and int(contact.get("revealed_to", {}).get(pid, 0)) <= SimEngine.tick:
				if RTSCommanderAI.issue_order([scout.tag], "revelation", contact.pos).ok:
					return true
	var vulnerable := contacts.filter(func(unit): return unit.flight_height <= 0.0 and unit.attributes.has("Light"))
	if not vulnerable.is_empty() and not scout.get("pulsar_active", false) and scout.energy >= 45.0:
		return RTSCommanderAI.issue_order([scout.tag], "pulsar_beam").ok
	if scout.get("pulsar_active", false) and vulnerable.is_empty():
		return RTSCommanderAI.issue_order([scout.tag], "end_pulsar_beam").ok
	return false

func _try_flagship_spell(pid: int, flagship: Dictionary) -> bool:
	if not SimEngine.ladder_rules or not RTSCommanderAI.is_on_camera(pid, flagship.pos):
		return false
	var visible := SimEngine.query_units_in_radius(flagship.pos, LadderRules.TIME_WARP_RANGE).filter(func(unit):
		return unit.hp > 0.0 and RTSCommanderAI.is_on_camera(pid, unit.pos) and SimEngine.can_see_unit(pid, unit))
	var hostile := visible.filter(func(unit): return not unit.is_structure and SimEngine.is_hostile_contact(pid, unit))
	if SimEngine.flagship_spell_block_reason(flagship, "time_warp").is_empty():
		for enemy in hostile:
			var nearby := hostile.filter(func(unit): return unit.pos.distance_squared_to(enemy.pos) <= LadderRules.TIME_WARP_RADIUS ** 2)
			if nearby.size() >= 4 and RTSCommanderAI.issue_order([flagship.tag], "time_warp", enemy.pos).ok:
				return true
	if not hostile.is_empty() and SimEngine.flagship_spell_block_reason(flagship, "flagship_cloak").is_empty():
		var allies := visible.filter(func(unit):
			return unit.owner == pid and not unit.is_structure and unit.pos.distance_squared_to(flagship.pos) <= LadderRules.FLAGSHIP_CLOAK_RADIUS ** 2)
		if allies.size() >= 4:
			return RTSCommanderAI.issue_order([flagship.tag], "flagship_cloak").ok
	return false

func _try_concord_air_spell(pid: int, ship: Dictionary) -> bool:
	if not RTSCommanderAI.is_on_camera(pid, ship.pos):
		return false
	if ship.unit_type == "prism_ray":
		if not SimEngine.prism_alignment_block_reason(ship).is_empty():
			return false
		for enemy in SimEngine.query_units_in_radius(ship.pos, 15.0, pid):
			if (enemy.hp > 0.0 and SimEngine.is_hostile_contact(pid, enemy) and enemy.attributes.has("Armored")
					and RTSCommanderAI.is_on_camera(pid, enemy.pos) and SimEngine.can_see_unit(pid, enemy)
					and SimEngine._edge_distance(ship, enemy) <= 15.0):
				return RTSCommanderAI.issue_order([ship.tag], "prism_alignment").ok
	elif SimEngine.gravity_lift_block_reason(ship).is_empty():
		var escorts := SimEngine.query_units_in_radius(ship.pos, 15.0).filter(func(ally):
			return (ally.tag != ship.tag and ally.owner == pid and ally.unit_type == "dawn_interceptor"
				and RTSCommanderAI.is_on_camera(pid, ally.pos) and not ally.is_immobile))
		if escorts.is_empty():
			return false
		for enemy in SimEngine.query_units_in_radius(ship.pos, LadderRules.GRAVITY_LIFT_RANGE, pid):
			if (enemy.hp > 0.0 and SimEngine.is_hostile_contact(pid, enemy) and not enemy.is_structure and not enemy.is_worker
					and enemy.flight_height <= 0.0 and RTSCommanderAI.is_on_camera(pid, enemy.pos) and SimEngine.can_see_unit(pid, enemy)
					and RTSCommanderAI.issue_order([ship.tag], "gravity_lift", enemy.pos, enemy.tag).ok):
				return true
	return false

func _try_wyrm_spell(pid: int, wyrm: Dictionary) -> bool:
	if not RTSCommanderAI.is_on_camera(pid, wyrm.pos):
		return false
	var contacts := SimEngine.query_units_in_radius(wyrm.pos, LadderRules.BLINDING_CLOUD_RANGE)
	var enemies := contacts.filter(func(unit):
		return (unit.hp > 0.0 and not unit.get("nonblocking", false) and SimEngine.is_hostile_contact(pid, unit)
			and RTSCommanderAI.is_on_camera(pid, unit.pos) and SimEngine.can_see_unit(pid, unit)))
	if wyrm.energy >= LadderRules.PARASITIC_CLOUD_COST:
		var aircraft := enemies.filter(func(unit): return unit.flight_height > 0.0 and not unit.is_structure)
		for target in aircraft:
			var nearby_air := aircraft.filter(func(unit): return unit.pos.distance_squared_to(target.pos) <= LadderRules.PARASITIC_CLOUD_RADIUS ** 2)
			if nearby_air.size() >= 3 and RTSCommanderAI.issue_order([wyrm.tag], "parasitic_cloud", target.pos, target.tag).ok:
				return true
	if wyrm.energy >= LadderRules.BLINDING_CLOUD_COST:
		var ranged := enemies.filter(func(unit):
			return unit.flight_height <= 0.0 and SimEngine.is_ranged_weapon(SimEngine._active_weapon(unit)))
		for target in ranged:
			var clustered := ranged.filter(func(unit): return unit.pos.distance_squared_to(target.pos) <= LadderRules.BLINDING_CLOUD_RADIUS ** 2)
			if (target.unit_type == "howitzer_emplaced" or clustered.size() >= 3) \
					and RTSCommanderAI.issue_order([wyrm.tag], "blinding_cloud", target.pos).ok:
				return true
	if wyrm.energy >= LadderRules.GRASP_COST:
		var allies := contacts.filter(func(unit):
			return (unit.owner == pid and not unit.is_worker and not unit.is_structure
				and RTSCommanderAI.is_on_camera(pid, unit.pos) and unit.pos.distance_squared_to(wyrm.pos) <= 9.0 ** 2
				and not SimEngine._active_weapon(unit).is_empty()))
		if allies.size() >= 4:
			for target in enemies:
				if target.attributes.has("Massive") and RTSCommanderAI.issue_order([wyrm.tag], "wyrm_grasp", target.pos, target.tag).ok:
					return true
	if wyrm.energy < 75.0 and enemies.is_empty():
		for structure in contacts:
			if (structure.hp > 350.0 and RTSCommanderAI.is_on_camera(pid, structure.pos) and SimEngine._can_siphon_structure(wyrm, structure)
					and RTSCommanderAI.issue_order([wyrm.tag], "siphon_structure", structure.pos, structure.tag).ok):
				return true
	return false

func _try_locust_launch(pid: int, brooder: Dictionary) -> void:
	if not RTSCommanderAI.is_on_camera(pid, brooder.pos) or not SimEngine.launch_locusts_block_reason(brooder).is_empty():
		return
	var best: Dictionary = {}
	var closest := 45.0 ** 2
	for target in SimEngine.query_units_in_radius(brooder.pos, 45.0, pid):
		if (target.hp <= 0.0 or target.flight_height > 0.0 or target.get("nonblocking", false)
				or not SimEngine.is_hostile_contact(pid, target) or not SimEngine.can_see_unit(pid, target)
				or not RTSCommanderAI.is_on_camera(pid, target.pos)):
			continue
		var distance: float = target.pos.distance_squared_to(brooder.pos)
		if distance < closest:
			best = target
			closest = distance
	if not best.is_empty():
		RTSCommanderAI.issue_order([brooder.tag], "launch_locusts", best.pos)

func _try_mireweaver_spell(pid: int, caster: Dictionary) -> void:
	if caster.energy < LadderRules.FUNGAL_GRASP_COST or not RTSCommanderAI.is_on_camera(pid, caster.pos):
		return
	var targets := SimEngine.query_units_in_radius(caster.pos, LadderRules.FUNGAL_GRASP_RANGE).filter(func(unit):
		return (not unit.is_structure and unit.hp > 0.0 and not unit.get("nonblocking", false)
			and SimEngine.is_hostile_contact(pid, unit) and SimEngine.can_see_unit(pid, unit)
			and RTSCommanderAI.is_on_camera(pid, unit.pos) and not SimEngine.fungal_grasp_active(unit)))
	var best: Dictionary = {}
	var best_count := 2
	if SimEngine.neural_tether_block_reason(caster).is_empty():
		for enemy in targets:
			if (enemy.attributes.has("Massive") or enemy.unit_type == "howitzer_emplaced") \
					and SimEngine._edge_distance(caster, enemy) <= LadderRules.NEURAL_TETHER_RANGE:
				if RTSCommanderAI.issue_order([caster.tag], "neural_tether", enemy.pos, enemy.tag).ok:
					return
	for candidate in targets:
		if caster.pos.distance_squared_to(candidate.pos) > LadderRules.FUNGAL_GRASP_RANGE ** 2:
			continue
		var count := 0
		for neighbor in targets:
			if candidate.pos.distance_squared_to(neighbor.pos) <= LadderRules.FUNGAL_GRASP_RADIUS ** 2:
				count += 1
		if count > best_count:
			best = candidate
			best_count = count
	if not best.is_empty():
		RTSCommanderAI.issue_order([caster.tag], "fungal_grasp", best.pos)
		return
	if not SimEngine.mireweaver_spell_block_reason(caster, "microbial_shroud").is_empty():
		return
	if targets.filter(func(enemy): return SimEngine.is_ranged_weapon(SimEngine._active_weapon(enemy, caster))).size() < 3:
		return
	var allies := SimEngine.query_units_in_radius(caster.pos, LadderRules.MICROBIAL_SHROUD_RANGE).filter(func(ally):
		return (ally.owner == pid and ally.hp > 0.0 and not ally.is_structure and not ally.is_worker and ally.flight_height <= 0.0
			and RTSCommanderAI.is_on_camera(pid, ally.pos) and not SimEngine._microbial_shroud_covers(ally)))
	for anchor in allies:
		if caster.pos.distance_squared_to(anchor.pos) > LadderRules.MICROBIAL_SHROUD_RANGE ** 2:
			continue
		var covered := allies.filter(func(ally): return anchor.pos.distance_squared_to(ally.pos) <= LadderRules.MICROBIAL_SHROUD_RADIUS ** 2)
		if covered.size() >= 4:
			RTSCommanderAI.issue_order([caster.tag], "microbial_shroud", anchor.pos)
			return

func _try_scribe_spell(pid: int, scribe: Dictionary) -> void:
	if scribe.energy < LadderRules.FEEDBACK_ENERGY or not RTSCommanderAI.is_on_camera(pid, scribe.pos):
		return
	var contacts: Array[Dictionary] = SimEngine.query_units_in_radius(scribe.pos, LadderRules.FEEDBACK_RANGE)
	var targets := contacts.filter(func(unit):
		return unit.owner > 0 and not unit.is_structure and not unit.get("nonblocking", false) \
			and RTSCommanderAI.is_on_camera(pid, unit.pos) and SimEngine.can_see_unit(pid, unit))
	if SimEngine.canticle_storm_block_reason(scribe).is_empty():
		for enemy in targets:
			if enemy.owner == pid or scribe.pos.distance_squared_to(enemy.pos) > LadderRules.STORM_RANGE ** 2:
				continue
			var value := 0
			for unit in targets:
				if unit.pos.distance_squared_to(enemy.pos) <= LadderRules.STORM_RADIUS ** 2:
					value += -4 if unit.owner == pid else 1
			if value >= 4 and RTSCommanderAI.issue_order([scribe.tag], "canticle_storm", enemy.pos).ok:
				return
	for enemy in targets:
		if enemy.owner != pid and enemy.energy >= 50.0 and RTSCommanderAI.issue_order([scribe.tag], "scribe_feedback", enemy.pos, enemy.tag).ok:
			return

func _try_rift_nova(pid: int, engine: Dictionary) -> bool:
	if SimEngine.rift_nova_ticks(engine) > 0 or not RTSCommanderAI.is_on_camera(pid, engine.pos):
		return false
	var radius := LadderRules.RIFT_NOVA_RADIUS
	var contacts: Array[Dictionary] = SimEngine.query_units_in_radius(engine.pos, LadderRules.RIFT_NOVA_RANGE)
	var ground := contacts.filter(func(unit):
		return (unit.owner > 0 and not unit.is_structure and unit.flight_height <= 0.0 and not unit.get("nonblocking", false)
			and RTSCommanderAI.is_on_camera(pid, unit.pos) and SimEngine.can_see_unit(pid, unit)))
	for enemy in ground:
		if enemy.owner == pid or engine.pos.distance_squared_to(enemy.pos) > LadderRules.RIFT_NOVA_RANGE ** 2:
			continue
		var value := 0
		for unit in ground:
			if unit.pos.distance_squared_to(enemy.pos) <= (radius + unit.radius) ** 2:
				value += -3 if unit.owner == pid else 1
		if value >= 3 and RTSCommanderAI.issue_order([engine.tag], "rift_nova_cast", enemy.pos).ok:
			return true
	return false
