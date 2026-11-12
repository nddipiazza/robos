extends SceneTree

const Rules = preload("res://scripts/engine/RTSLadderRules.gd")

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	sim.rts_mode = "backend"
	sim._load_skirmish({"watch_ai": true, "online": true, "seed": 3, "player_faction": "aliens", "ai_faction": "humans",
		"map": {"width": 256, "height": 128, "starts": [{"x": 50, "y": 45}, {"x": 205, "y": 45}]}})
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	for unit in sim.units.values():
		if unit.is_worker:
			sim.issue_command([unit.tag], "stop")
	var base: Vector2 = sim.units.values().filter(func(unit): return unit.unit_type == "heartstone").front().pos
	sim.spawn_unit("resonator", 1, base + Vector2(0, 10))
	var gate: Dictionary = sim.spawn_unit("waystone", 1, base + Vector2(7, 11))
	var bank: Dictionary = sim.players[1]
	bank.crystal = 500
	bank.aether = 300
	_check(not sim.issue_command([gate.tag], "train_mirage_adept").ok, "Waystone requires the Concord Core")
	sim.spawn_unit("concord_core", 1, base + Vector2(4, 18))
	var twilight: Dictionary = sim.spawn_unit("twilight_array", 1, base + Vector2(-7, 11))
	_check(sim.issue_command([gate.tag], "train_mirage_adept").ok and bank.crystal == 400 and bank.aether == 275
		and gate.production_queue.front().total_time == 30.0, "Adept queues for 100 crystal and 25 aether with 30 seconds of production")
	var adept: Dictionary = sim.spawn_unit("mirage_adept", 1, Vector2(85, 95))
	var ready_ticks: int = Rules.MIRAGE_SHADE_COOLDOWN * sim.TICK_RATE
	var shade_ticks: int = Rules.MIRAGE_SHADE_SECONDS * sim.TICK_RATE
	var requested := Vector2(106, 95)
	sim._refresh_vision()
	var supply_before: float = bank.supply_used
	_check(sim.issue_command([adept.tag], "mirage_transfer", requested).ok, "Adept projects a Shade")
	_check(bank.supply_used == supply_before, "The projection consumes no supply")
	var shade: Dictionary = sim.units.get(adept.get("mirage_shade_tag", 0), {})
	if shade.is_empty():
		_finish()
		return
	_check(sim.mirage_transfer_ticks(adept) == ready_ticks and shade.sight_range == 10.0, "Shade has scout vision and the 11-second cooldown starts at cast")
	var guard: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(109, 106))
	_check(not sim.can_attack(guard, shade), "Opposing weapons cannot target the Shade")
	sim._apply_damage_to_target(guard, shade, 100.0, {}, 1.0)
	_check(shade.hp == 1.0, "Splash damage cannot destroy the Shade")
	var scout_edge := Vector2(114, 97)
	_check(not sim.can_see_position(1, scout_edge), "The scout site starts in fog")
	_check(sim.issue_command([adept.tag], "move", Vector2(88, 94)).ok
		and sim.issue_command([shade.tag], "move", Vector2(109, 97)).ok, "Caster and Shade take independent movement commands")
	sim.step_ticks(shade_ticks - 1)
	_check(sim.units.has(shade.tag) and adept.pos.distance_to(shade.pos) > 12.0, "The Adept stays behind until the Shade's timer ends")
	_check(sim.can_see_position(1, scout_edge), "The Shade reveals ground beyond its Adept's sight")
	var landing: Vector2 = shade.pos
	sim.step_ticks(1)
	_check(not sim.units.has(shade.tag) and adept.pos.distance_to(landing) < 0.5, "The Adept transfers to the Shade at the deadline")
	_check(not sim.issue_command([adept.tag], "mirage_transfer", requested).ok, "The cooldown extends past the transfer")
	sim.step_ticks(ready_ticks - shade_ticks)
	_check(sim.issue_command([adept.tag], "mirage_transfer", Vector2(95, 105)).ok, "The ability becomes available after 11 seconds")
	var cancel_tag: int = adept.get("mirage_shade_tag", 0)
	var before_cancel: Vector2 = adept.pos
	_check(sim.issue_command([cancel_tag], "cancel_mirage_transfer").ok and not sim.units.has(cancel_tag)
		and not adept.has("mirage_shade_tag") and adept.pos == before_cancel, "Cancelling from the Shade keeps the Adept in place")
	sim.step_ticks(ready_ticks)
	_check(sim.issue_command([adept.tag], "mirage_transfer", requested).ok
		and sim.issue_command([adept.tag], "cancel_mirage_transfer").ok, "The Adept can also cancel its Shade")
	_check(sim.issue_command([twilight.tag], "research_resonant_glaives").ok
		and bank.crystal == 300 and bank.aether == 175, "Glaives are paid Twilight Array research")
	sim.step_ticks(100 * sim.TICK_RATE + 1)
	_check(bank.upgrades.get("resonant_glaives", 0) == 1 and sim._attack_speed_multiplier(adept) == 1.45,
		"Glaives grant the 45 percent attack-speed upgrade after research")
	var shooter: Dictionary = sim.spawn_unit("mirage_adept", 1, Vector2(141, 100))
	var light: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(146, 100))
	var armored: Dictionary = sim.spawn_unit("breacher", 2, Vector2(141, 106))
	bank.upgrades["concord_ground_weapons"] = 1
	sim._refresh_vision()
	var light_hp: float = light.hp
	var armored_hp: float = armored.hp
	var weapon: Dictionary = sim._active_weapon(shooter, light)
	_check(sim._execute_weapon_hit(shooter, light, {}, weapon) and is_equal_approx(light_hp - light.hp, 24.0 - light.armor),
		"Level one deals 24 damage to light targets before armor")
	_check(sim._execute_weapon_hit(shooter, armored, {}, weapon) and is_equal_approx(armored_hp - armored.hp, 11.0 - armored.armor),
		"Level one deals 11 damage to other ground targets before armor")
	bank.upgrades["transit"] = 1
	_check(sim.issue_command([gate.tag], "open_transit").ok, "A researched Waystone can open Transit")
	sim.step_ticks(ceili(Rules.TRANSIT_MORPH_SECONDS * sim.TICK_RATE))
	var deployment := base + Vector2(-6, 17)
	sim._refresh_vision()
	_check(sim.issue_command([gate.tag], "transit_mirage_adept", deployment).ok
		and gate.transit_charge == 20.0 and bank.crystal == 200 and bank.aether == 150,
		"Powered Transit deploys the Adept at the same price and starts a 20-second cooldown")
	_finish()

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
		push_error(label)

func _finish() -> void:
	if failures.is_empty():
		print("PASS: Adept production and deployment, glaive damage and research, Shade movement, vision, immunity, transfer, cooldown, cancellation")
	quit(0 if failures.is_empty() else 1)
