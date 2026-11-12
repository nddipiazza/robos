extends RefCounted

const VERSION := 12
const LadderRules = preload("res://scripts/engine/RTSLadderRules.gd")
const PORT := 18110
const FRAME_TICKS := 2
const MAX_TAGS := 200
const MAX_COMMANDS := 12
const MAX_CLIENT_BYTES := 4096
const MAX_SERVER_BYTES := 32768
const EXTRA_ORDERS := ["attack_move", "attack_target", "force_attack", "follow", "enter_bunker",
	"cancel_training", "undo_queued_order", "reset_rally", "fill_gas", "resume_construction", "cancel_queued_build"]

static func send(peer: ENetPacketPeer, message: Array) -> Error:
	return peer.send(0, JSON.stringify(message, "", true, true).to_utf8_buffer(), ENetPacketPeer.FLAG_RELIABLE)

static func receive(peer: ENetPacketPeer, max_bytes: int) -> Array:
	var packet := peer.get_packet()
	if packet.is_empty() or packet.size() > max_bytes:
		return []
	var value: Variant = JSON.parse_string(packet.get_string_from_utf8())
	return value if value is Array and not value.is_empty() and value[0] is String else []

static func integer(value: Variant, minimum: int, maximum: int) -> bool:
	return (value is int or value is float) and value >= minimum and value <= maximum and value == floor(value)

static func new_order_sequence(data: Array, previous: int) -> int:
	if data.size() != 9 or not integer(data[8], previous + 1, 2147483647):
		return 0
	return int(data[8])

static func normalize_order(sim: Node, seat: int, data: Array) -> Array:
	# Client wire order: type, tags, ability, x, y, target, argument, queued, sequence.
	if data.size() != 9 or not data[1] is Array or data[1].is_empty() or data[1].size() > MAX_TAGS:
		return []
	if not data[2] is String or data[2].length() > 64 or not data[6] is String or data[6].length() > 24 or not data[7] is bool:
		return []
	var ability: String = data[2]
	if ability not in EXTRA_ORDERS and sim.get_node("/root/RTSData").get_ability_def(ability).is_empty():
		return []
	if not integer(data[5], 0, 2147483647):
		return []
	for axis in [data[3], data[4]]:
		if not (axis is int or axis is float) or not is_finite(float(axis)) or absf(float(axis)) > 8192.0:
			return []
	var tags: Array[int] = []
	var seen := {}
	for tag in data[1]:
		if not integer(tag, 1, 2147483647):
			return []
		var unit: Dictionary = sim.units.get(int(tag), {})
		if unit.is_empty():
			continue
		if unit.owner != seat:
			return []
		if not seen.has(int(tag)):
			tags.append(int(tag))
			seen[int(tag)] = true
	if tags.is_empty():
		return []
	var target := int(data[5])
	var target_unit: Dictionary = sim.units.get(target, {})
	if not target_unit.is_empty() and not sim.can_see_unit(seat, target_unit):
		return []
	if ability == "cancel_training" and not data[6].is_empty() and (not data[6].is_valid_int() or not integer(data[6].to_int(), 0, 1023)):
		return []
	return [tags, ability, float(data[3]), float(data[4]), target, data[6], data[7]]

static func apply_order(sim: Node, order: Array) -> Dictionary:
	return sim.issue_command(order[0], order[1], Vector2(order[2], order[3]), int(order[4]), order[5], order[6])

static func match_setup(sim: Node) -> Array:
	var state: Dictionary = sim.match_state
	return [state.factions["1"], state.factions["2"], str(state.assigned_starts["1"]), str(state.assigned_starts["2"]), state.get("ruleset", "starfall")]

static func compatibility_digest(sim: Node) -> String:
	var definitions: Node = sim.get_node("/root/RTSData")
	var map_id: String = sim.match_state.map_id
	var data: Array = [VERSION, sim.skirmish_map_config(map_id), definitions.units, definitions.abilities, definitions.faction_info]
	if sim.ladder_rules:
		data.append([LadderRules.ID, LadderRules.MINERAL_STOCK, LadderRules.GAS_STOCK, LadderRules.UNITS,
			sim.RIDGE_CHARGE_RANGE, sim.RIDGE_CHARGE_RADIUS, sim.RIDGE_CHARGE_DELAY_TICKS, sim.RIDGE_CHARGE_COOLDOWN_TICKS,
			LadderRules.NATURAL_LARVA_SECONDS, LadderRules.INJECT_SECONDS, LadderRules.INJECT_LARVAE,
			LadderRules.INJECT_HANDOFF_SECONDS, LadderRules.INJECT_RELEASE_SECONDS, LadderRules.LARVA_LIMIT,
			LadderRules.LARVA_OFF_CREEP_SECONDS, LadderRules.STALEMATE_WARNING_SECONDS,
			LadderRules.STALEMATE_DRAW_SECONDS, LadderRules.HEADQUARTERS_REVEAL_SECONDS, LadderRules.SHIELD_REGEN_PER_SECOND,
			LadderRules.SHIELD_REGEN_DELAY_SECONDS, LadderRules.NON_ELIMINATION_STRUCTURES,
			LadderRules.WEAPON_JITTER_MIN, LadderRules.WEAPON_JITTER_MAX, LadderRules.WEAPON_RANGE_SLOP,
			LadderRules.WEAPON_RANGE_SLOP_OVERRIDES, LadderRules.MOVEMENT_PROFILES, LadderRules.TURN_BEFORE_MOVING,
			LadderRules.WATCHKEEPER_MISSILE_ACCELERATION, LadderRules.WATCHKEEPER_MISSILE_MAX_SPEED,
			LadderRules.MINE_MISSILE_RISE_SECONDS, LadderRules.MINE_MISSILE_ACCELERATION, LadderRules.MINE_MISSILE_MAX_SPEED,
			LadderRules.TRANSIT_MORPH_SECONDS, LadderRules.TRANSIT_FAST_SECONDS, LadderRules.TRANSIT_SLOW_SECONDS,
			LadderRules.TRANSIT_COOLDOWNS, LadderRules.TRANSIT_RESEARCH, LadderRules.CONCORD_BOOST_SECONDS,
			LadderRules.ENERGY_RECHARGE_COST, LadderRules.ENERGY_RECHARGE_AMOUNT, LadderRules.ENERGY_RECHARGE_SECONDS,
			LadderRules.ENERGY_RECHARGE_RANGE, LadderRules.RECALL_RADIUS, LadderRules.RECALL_CHANNEL_SECONDS,
			LadderRules.RECALL_COOLDOWN_SECONDS, LadderRules.RECALL_ARRIVAL_PROTECTION_SECONDS, LadderRules.CHARGE_RESEARCH,
			LadderRules.PHASE_STEP_RESEARCH, LadderRules.SUNBLADE_UPGRADED_SPEED, LadderRules.CHARGE_SPEED,
			LadderRules.CHARGE_COOLDOWN_SECONDS, LadderRules.CHARGE_DURATION_SECONDS, LadderRules.CHARGE_RANGE, LadderRules.PHASE_STEP_RANGE,
			LadderRules.CONCORD_FORGE_UPGRADES, LadderRules.CONCORD_FORGE_TIMES, LadderRules.WISP_MOBILE_SIGHT,
			LadderRules.WISP_SURVEILLANCE_SIGHT, LadderRules.CARRIER_ANCHOR_SECONDS, LadderRules.CARRIER_FOLD_SECONDS,
			LadderRules.CARRIER_FIELD_RADIUS, LadderRules.ROBOTICS_UPGRADES, LadderRules.WISP_UPGRADED_SPEED,
			LadderRules.LUMEN_UPGRADED_SPEED, LadderRules.EXTENDED_PRISM_BONUS, LadderRules.BASTION_BARRIER_HP,
			LadderRules.BASTION_BARRIER_SECONDS, LadderRules.BASTION_BARRIER_COOLDOWN, LadderRules.RIFT_NOVA_SECONDS,
			LadderRules.RIFT_NOVA_COOLDOWN, LadderRules.RIFT_NOVA_RANGE, LadderRules.RIFT_NOVA_RADIUS,
			LadderRules.RIFT_NOVA_DAMAGE, LadderRules.RIFT_NOVA_SHIELD_DAMAGE])
	return JSON.stringify(data, "", true, true).sha256_text()

static func digest(sim: Node) -> String:
	var state: Array = [sim.tick, sim.stalemate_seconds_remaining(), sim.ladder_no_headquarters_since, sim.weapon_rng.state]
	for seat in [1, 2]:
		var player: Dictionary = sim.players[seat]
		state.append([player.crystal, player.aether, player.supply_used, player.supply_cap, player.upgrades,
			player.get("energy_recharge_ready", 0), player.get("defensive_recall_ready", 0)])
	var tags: Array = sim.units.keys()
	tags.sort()
	for tag in tags:
		var unit: Dictionary = sim.units[tag]
		state.append([tag, unit.owner, unit.unit_type, roundi(unit.pos.x * 20), roundi(unit.pos.y * 20),
			roundi(unit.hp * 20), roundi(unit.shields * 20), roundi(unit.energy * 20), unit.orders.size(), unit.attack_target_tag,
			roundi(unit.weapon_cooldown * 1000),
			unit.get("motion_tick", 0), unit.get("motion_speed", 0.0),
			roundi(unit.build_progress * 1000), unit.production_queue.size(), unit.get("cargo_amount", 0),
			unit.get("brood_slots", 0), unit.get("brood_inject_finish", 0), unit.get("brood_inject_queued", 0),
			unit.get("brood_release_remaining", 0), unit.get("brood_release_tick", 0), unit.get("ridge_charge_ready", 0),
			unit.get("transit_morph", {}).get("ticks", 0), unit.get("transit_finish", 0), unit.get("transit_charge", 0),
			unit.get("recall_channel", false), unit.get("recall_protection_until", 0), unit.get("auto_charge", false),
			unit.get("charge_ready_tick", 0), unit.get("auto_aegis", false), roundi(unit.phase_cooldown * 100),
			unit.get("carrier_anchored", false), unit.get("power_field_transition", {}).get("finish", 0),
			unit.get("cloaked", false), unit.is_immobile, unit.get("auto_bastion_barrier", false),
			unit.get("bastion_barrier_hp", 0.0), unit.get("bastion_barrier_ready", 0), unit.get("rift_finish", 0),
			unit.get("rift_nova_ready", 0), unit.get("active_rift_nova", 0), unit.get("mirage_finish", 0),
			unit.get("mirage_transfer_ready", 0), unit.get("mirage_shade_tag", 0), unit.get("mirage_adept_tag", 0),
			unit.get("canticle_storm_ready", 0), unit.get("archon_partner", 0), unit.get("archon_warp_finish", 0),
			sim.guardian_shields.get(tag, 0), unit.get("hallucinated", false), unit.get("expires_tick", 0),
			unit.get("brood_morph", {}), unit.get("caustic_barrage_ready", 0), unit.get("structure_form", ""),
			unit.get("burrowed", false), unit.get("burrow_mobile", false), unit.get("burrow_transition", {}),
			unit.get("hurler_lunge_until", 0), unit.get("hurler_lunge_ready", 0),
			unit.get("crawler_uprooted", false), unit.get("crawler_transition", {}), unit.get("contaminated_until", 0),
			unit.get("generating_creep", false), unit.get("disguise_type", ""), unit.get("disguise_owner", 0),
			unit.get("disguise_detail", ""), unit.get("rich_extractor", false), unit.get("gas_extracting", false),
			unit.get("caustic_spray", {}), unit.get("caustic_spray_ready", 0),
			sim.fungal_infections.get(tag, {}).get("ends", 0), sim.fungal_infections.get(tag, {}).get("pulse", 0),
			sim.fungal_infections.get(tag, {}).get("source", {}).get("tag", 0),
			sim.neural_tethers.get(tag, {}), unit.get("neural_original_owner", 0), unit.get("locust_launch_ready", 0),
			unit.get("auto_locust_swoop", true), unit.get("locust_destination", Vector2.ZERO), unit.get("locust_descent", {}),
			unit.get("brood_worm_ready", 0), unit.get("brood_tunnel_load_ready", 0), unit.get("brood_tunnel_unload", 0),
			unit.get("siphon_target", 0), unit.get("siphon_ends", 0), unit.get("transfuse_until", 0),
			unit.get("transfuse_ready", 0), unit.get("growth_node_ready", 0), unit.get("growth_node_spent", false),
			unit.get("gravity_lift_target", 0), unit.get("gravity_lift_ends", 0), unit.get("gravity_lifted_by", 0),
			unit.get("alignment_until", 0), unit.get("alignment_ready", 0), unit.get("fighter_reserve", 0),
			unit.get("active_fighters", []), unit.get("fighter_orders", 0), unit.get("fighter_finish", 0),
			unit.get("fighter_target", 0), unit.get("fighter_launch_ready", 0), unit.get("auto_build_fighters", false),
			unit.get("carrier_parent", 0), unit.get("pulsar_active", false), unit.get("revelation_ready", 0),
			unit.get("revealed_to", {}), unit.get("stasis_until", 0), unit.get("flagship_cloak_until", 0),
			unit.get("flagship_cloak_ready", 0), unit.get("flagship_recall_ready", 0), unit.get("time_warp_ready", 0),
			unit.get("agent_snipe", {}), unit.get("agent_strike", {}), unit.get("emp_reveal_until", 0),
			unit.get("tactical_charge_ready", false), unit.get("vehicle_transition", {}), unit.get("silo_raise_until", 0), unit.get("mine_target", {}),
			unit.get("mine_ready", 0), unit.get("auto_sentinel_missiles", false),
			unit.get("vortex_lock_state", {}), unit.get("vortex_lock_ready", 0), unit.get("auto_vortex_lock", false),
			unit.get("surge_ready", 0), unit.surge_timer, unit.slow_timer, unit.get("salvage_finish", 0),
			unit.get("fighter_mode_until", 0), unit.get("rampart_boost_until", 0), unit.get("rampart_boost_ready", 0),
			unit.get("rampart_drop_ready", 0), unit.get("auto_heal", false), unit.get("support_target_tag", 0),
			unit.get("sky_transition", {}), unit.get("sky_zone", {}),
			unit.get("hub_operations", false), unit.get("supply_reinforced", false),
			unit.get("mining_source_tag", 0), unit.get("harvest_leave_tick", 0),
			unit.get("gas_exit_pos", Vector2.ZERO), unit.get("gas_queue", []), unit.get("mining_worker", 0),
			unit.get("repair_credit_crystal", 0.0), unit.get("repair_credit_aether", 0.0),
			unit.get("systems_jammed_until", 0), unit.get("armor_breaker_until", 0), unit.get("dread_beam", {}),
			unit.get("dread_jump", {}), unit.get("dread_in_transit", false), unit.get("dread_beam_ready", 0), unit.get("dread_jump_ready", 0),
			unit.get("passengers", []).map(func(passenger): return [passenger.tag, passenger.unit_type, passenger.hp])])
	for owner in sim.players:
		var cargo: Array = sim.brood_tunnel_cargo.get(owner, [])
		if not cargo.is_empty():
			state.append([owner, cargo.map(func(passenger): return [passenger.tag, passenger.unit_type, passenger.hp])])
	for charge in sim.ridge_charges:
		state.append([charge.source.tag, charge.pos.x, charge.pos.y, charge.burst_tick])
	for zone in sim.canticle_storms:
		state.append([zone.source.tag, zone.pos.x, zone.pos.y, zone.ends])
	for shot in sim.fungal_projectiles:
		state.append([shot.source.tag, shot.pos.x, shot.pos.y, shot.impact])
	for zone in sim.microbial_shrouds:
		state.append([zone.pos.x, zone.pos.y, zone.ends])
	for cloud in sim.blinding_clouds:
		state.append([cloud.pos.x, cloud.pos.y, cloud.ends])
	for cloud in sim.parasitic_clouds:
		state.append([cloud.source.tag, cloud.target, cloud.pos.x, cloud.pos.y, cloud.ends])
	for zone in sim.time_warps:
		state.append([zone.owner, zone.pos.x, zone.pos.y, zone.activates, zone.ends])
	for shot in sim.emp_projectiles:
		state.append([shot.source.tag, shot.pos.x, shot.pos.y, shot.impact])
	for shot in sim.watchkeeper_missiles:
		state.append([shot.spell, shot.source.tag, shot.target, shot.pos.x, shot.pos.y, shot.speed, shot.expires])
	for shot in sim.sentinel_missiles:
		state.append([shot.source.tag, shot.target, shot.pos.x, shot.pos.y, shot.speed, shot.guidance_tick])
	for strike in sim.caustic_strikes:
		state.append([strike.source.tag, strike.pos.x, strike.pos.y, strike.impact])
	var approach_tags: Array = sim.archon_approaches.keys()
	approach_tags.sort()
	for tag in approach_tags:
		var approach: Dictionary = sim.archon_approaches[tag]
		state.append([tag, approach.second, approach.point.x, approach.point.y])
	var resource_tags: Array = sim.resources.keys()
	resource_tags.sort()
	for tag in resource_tags:
		var deposit: Dictionary = sim.resources[tag]
		state.append([tag, deposit.amount, deposit.mining_worker, deposit.get("gas_queue", [])])
	return JSON.stringify(state).sha256_text().left(16)
