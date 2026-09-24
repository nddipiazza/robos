class_name Trap
extends Area2D

# Trap.gd — Infinity Engine Tactical Trap Component for Godot 4
# Simulates concealed floor, container, and glyph hazards governed by D&D 5e SRD & Infinity Engine rules:
# - Concealed state (hidden from party vision)
# - Thief Find Traps modal skill & passive perception sweeps
# - Divination spell detection (Find Traps)
# - Pulsing red danger highlight (classic Baldur's Gate aesthetic)
# - Thieves' Tools disarm checks (with critical fumble detonation)
# - Trigger resolution with saving throws, damage formulas, and status conditions

signal trap_detected(trap_node: Node2D, by_actor: String)
signal trap_disarmed(trap_node: Node2D, by_actor: String)
signal trap_triggered(trap_node: Node2D, victim_name: String)

@export var trap_id: String = "poison-dart-trap"
@export var trap_name: String = "Concealed Poison Dart Trap"
@export var trap_type: String = "floor" # "floor", "glyph", "container", "door"
@export var detect_dc: int = 13
@export var disarm_dc: int = 14
@export var save_stat: String = "CON"
@export var save_dc: int = 13
@export var damage_dice_min: int = 2
@export var damage_dice_max: int = 12
@export var damage_type: String = "poison"
@export var status_effect: String = "poisoned"
@export var status_duration: int = 3

@export var is_detected: bool = false
@export var is_disarmed: bool = false
@export var is_triggered: bool = false
@export var detection_radius: float = 650.0
@export var disarm_reach: float = 80.0
var next_trigger_force_fail_save: bool = false

@onready var visual_poly: Polygon2D = get_node_or_null("HazardVisual")
@onready var outline_line: Line2D = get_node_or_null("Outline")
@onready var label: Label = get_node_or_null("StatusLabel")
@onready var collision_shape: CollisionShape2D = get_node_or_null("CollisionShape2D")

var pulse_tween: Tween = null

var is_vanishing: bool = false
var vanish_tween: Tween = null

func _ready() -> void:
	collision_layer = 1
	collision_mask = 1
	body_entered.connect(_on_body_entered)
	_sync_data_store()
	# Restore persistent neutralized state (a trap disarmed/sprung earlier stays gone on re-entry)
	var prior = GameState.get_trap_neutralized_state(_scene_key(), trap_id) if GameState.has_method("get_trap_neutralized_state") else ""
	if prior == "disarmed":
		is_disarmed = true
		is_detected = true
	elif prior == "triggered":
		is_triggered = true
		is_detected = true
	_update_visual_state(false)
	if prior != "":
		_report_restored.call_deferred(prior)

func _report_restored(prior: String) -> void:
	var info = get_trap_info()
	info["previous_state"] = prior
	GameState.record_event("trap_restored_neutralized", info)

func _scene_key() -> String:
	var tree = get_tree()
	if tree and tree.current_scene:
		return String(tree.current_scene.name)
	return String(owner.name) if owner else "Scene"

func is_neutralized() -> bool:
	return is_disarmed or is_triggered

func _sync_data_store() -> void:
	var ds = null
	if Engine.get_main_loop() is SceneTree and (Engine.get_main_loop() as SceneTree).root.has_node("DataStore"):
		ds = (Engine.get_main_loop() as SceneTree).root.get_node("DataStore")
	if ds and "traps" in ds and ds.traps.has(trap_id):
		var d = ds.traps[trap_id]
		trap_name = str(d.get("title", trap_name))
		detect_dc = int(d.get("detectDC", detect_dc))
		disarm_dc = int(d.get("disarmDC", disarm_dc))
		save_stat = str(d.get("saveStat", save_stat))
		save_dc = int(d.get("saveDC", save_dc))
		damage_dice_min = int(d.get("damageMin", damage_dice_min))
		damage_dice_max = int(d.get("damageMax", damage_dice_max))
		damage_type = str(d.get("damageType", damage_type))
		status_effect = str(d.get("statusEffect", status_effect))
		status_duration = int(d.get("statusDuration", status_duration))

func _update_visual_state(animate: bool = true) -> void:
	if is_disarmed or is_triggered:
		# Infinity Engine rule: a neutralized trap is removed from the map entirely.
		_stop_pulse()
		_disable_hazard()
		if animate and is_inside_tree() and visible:
			_vanish(Color(0.35, 1.0, 0.45, 1.0) if is_disarmed else Color(1.0, 0.55, 0.15, 1.0))
		else:
			_hide_immediately()
	elif is_detected:
		visible = true
		modulate = Color(1.0, 0.15, 0.15, 0.95)
		if label:
			label.text = "⚠️ [TRAP] " + trap_name
			label.visible = true
			label.modulate = Color(1.0, 0.2, 0.2, 1.0)
		_start_pulse()
	else:
		_stop_pulse()
		# Concealed: fully transparent to the player until detected
		modulate = Color(1.0, 1.0, 1.0, 0.0)
		if label:
			label.visible = false

func _disable_hazard() -> void:
	if collision_shape:
		collision_shape.set_deferred("disabled", true)
	set_deferred("monitoring", false)
	set_deferred("monitorable", false)
	input_pickable = false

func _hide_immediately() -> void:
	var was_shown = visible
	is_vanishing = false
	visible = false
	modulate = Color(1.0, 1.0, 1.0, 0.0)
	if visual_poly:
		visual_poly.visible = false
	if outline_line:
		outline_line.visible = false
	if label:
		label.visible = false
	if was_shown and is_inside_tree():
		_report_vanished.call_deferred()

func _report_vanished() -> void:
	# Deferred so the physics flags set with set_deferred() are already applied
	GameState.record_event("trap_vanished", get_trap_info())

func _vanish(flash_color: Color) -> void:
	# Brief confirmation flash (green = dismantled, orange = sprung), then the glyph fades out
	if vanish_tween:
		vanish_tween.kill()
	is_vanishing = true
	if label:
		label.visible = false
	modulate = flash_color
	vanish_tween = create_tween()
	vanish_tween.tween_property(self, "scale", Vector2(1.15, 1.15), 0.12).set_trans(Tween.TRANS_SINE)
	vanish_tween.parallel().tween_property(self, "modulate", Color(flash_color.r, flash_color.g, flash_color.b, 0.0), 0.55).set_delay(0.1)
	vanish_tween.parallel().tween_property(self, "scale", Vector2(0.6, 0.6), 0.55).set_delay(0.1)
	vanish_tween.tween_callback(func():
		scale = Vector2.ONE
		_hide_immediately()
	)

func _start_pulse() -> void:
	if pulse_tween:
		pulse_tween.kill()
	pulse_tween = create_tween().set_loops()
	pulse_tween.tween_property(self, "modulate:a", 0.45, 0.6).set_trans(Tween.TRANS_SINE)
	pulse_tween.tween_property(self, "modulate:a", 1.0, 0.6).set_trans(Tween.TRANS_SINE)

func _stop_pulse() -> void:
	if pulse_tween:
		pulse_tween.kill()
		pulse_tween = null

# ── Detection Methods ─────────────────────────────────────────────────────────

func reveal_trap(by_actor: String = "Divine Divination") -> void:
	if is_disarmed or is_triggered:
		return
	is_detected = true
	_update_visual_state()
	GameState.record_event("trap_detected", {"trap_id": trap_id, "by": by_actor, "position": [global_position.x, global_position.y]})
	GameState.trap_detected.emit(trap_id, by_actor)
	trap_detected.emit(self, by_actor)
	if FloatingTextManager:
		FloatingTextManager.spawn_status(global_position, "TRAP DETECTED!")

func attempt_detection(detector_name: String) -> bool:
	if is_detected or is_disarmed or is_triggered:
		return false

	# Check distance to detector
	var cur_sc = get_tree().current_scene if get_tree() else null
	var actor_pos = Vector2.ZERO
	if cur_sc:
		var hero = cur_sc.find_child("HeroPlayer", true, false)
		if hero and (detector_name == GameState.hero_name or detector_name == "Hero"):
			actor_pos = hero.global_position
		else:
			for child in cur_sc.get_children():
				if child is CharacterBody2D and (child.name.to_lower().contains(detector_name.to_lower()) or child.get("companion_name") == detector_name):
					actor_pos = child.global_position
					break

	if actor_pos != Vector2.ZERO and global_position.distance_to(actor_pos) > detection_radius:
		return false

	# Check fog of war
	if cur_sc:
		var fow = cur_sc.find_child("FogOfWar", true, false)
		if fow and fow.has_method("is_point_explored") and fow.has_method("_is_fog_enabled"):
			if fow._is_fog_enabled():
				if not (fow.is_point_explored(global_position) or fow.is_point_in_vision(global_position)):
					return false

	var cm = _get_combat_manager()
	var perception_bonus = 4 # Default rogue / high perception bonus (+2 WIS + 2 Prof)
	if detector_name == GameState.hero_name:
		var wis_mod = GameState.get_stat_modifier(int(GameState.ability_scores.get("WIS", 12)))
		var prof = 4 if GameState.hero_class.to_lower() == "rogue" else 2
		perception_bonus = max(4, wis_mod + prof)
	elif detector_name == "Bramble Ironheart" or detector_name == "Bramble":
		perception_bonus = 5

	var res = cm.resolve_trap_detection(detector_name, perception_bonus, detect_dc, trap_name)
	if res.get("success", false):
		reveal_trap(detector_name)
		return true
	return false

func _get_actor_node(actor_name: String) -> CharacterBody2D:
	var cur_sc = get_tree().current_scene if get_tree() else null
	if not cur_sc: return null
	var hero = cur_sc.find_child("HeroPlayer", true, false)
	if hero and (actor_name == "" or actor_name == GameState.hero_name or actor_name.to_lower() == "hero" or hero.name.to_lower().contains(actor_name.to_lower())):
		return hero
	for child in cur_sc.get_children():
		if child is CharacterBody2D:
			if child.name.to_lower().contains(actor_name.to_lower()) or child.get("companion_name") == actor_name:
				return child
	return hero

# ── Disarm Methods ────────────────────────────────────────────────────────────

func disarm_trap(disarmer_name: String, force_fumble: bool = false) -> Dictionary:
	if is_disarmed:
		return {"success": true, "already_disarmed": true}
	if is_triggered:
		return {"success": false, "already_triggered": true}

	var actor_node = _get_actor_node(disarmer_name)
	if actor_node:
		var dist = global_position.distance_to(actor_node.global_position)
		if dist > disarm_reach:
			GameState.log_message("combat", "⚠️ [TOO FAR] %s must walk next to %s to disarm it! (Distance: %d px, max reach: %d px)" % [disarmer_name, trap_name, int(dist), int(disarm_reach)])
			return {
				"success": false,
				"error": "Must walk next to trap first! %s is too far (%.1f px away; max reach is %.1f px)." % [disarmer_name, dist, disarm_reach],
				"too_far": true,
				"distance": dist,
				"disarm_reach": disarm_reach
			}

	var cm = _get_combat_manager()
	var tools_bonus = 5 # Standard thief sleight of hand (+3 DEX + 2 Prof)
	if disarmer_name == GameState.hero_name:
		var dex_mod = GameState.get_stat_modifier(int(GameState.ability_scores.get("DEX", 14)))
		var prof = 4 if GameState.hero_class == "rogue" else 2 # Expertise with Thieves' Tools for Rogues
		tools_bonus = max(5, dex_mod + prof)

	var res = cm.resolve_trap_disarm(disarmer_name, tools_bonus, disarm_dc, trap_name, force_fumble)

	if res.get("success", false):
		is_disarmed = true
		GameState.mark_trap_neutralized(_scene_key(), trap_id, "disarmed")
		var disarmer = _get_actor_node(disarmer_name)
		GameState.record_event("trap_disarmed", {"trap_id": trap_id, "by": disarmer_name, "roll_total": res.get("total"), "dc": disarm_dc,
			"disarmer_distance_px": disarmer.global_position.distance_to(global_position) if disarmer else -1.0, "disarm_reach_px": disarm_reach})
		_update_visual_state()
		GameState.trap_disarmed.emit(trap_id, disarmer_name)
		trap_disarmed.emit(self, disarmer_name)
		if FloatingTextManager:
			FloatingTextManager.spawn_status(global_position, "TRAP DISARMED")
		return {"success": true, "disarmed": true, "d20": res.get("d20"), "total": res.get("total")}
	elif res.get("fumble", false):
		# Detonate directly in disarmer's face because they are standing right next to it!
		var trig_res = force_trigger(disarmer_name, false, true)
		return {"success": false, "fumble": true, "triggered": true, "trigger_result": trig_res}
	else:
		return {"success": false, "fumble": false, "d20": res.get("d20"), "total": res.get("total")}

func approach_and_disarm(actor_name: String = "", force_fumble: bool = false, on_complete: Callable = Callable()) -> void:
	var actor = _get_actor_node(actor_name)
	if not actor:
		if on_complete.is_valid():
			on_complete.call({"success": false, "error": "Actor not found"})
		return

	var a_name = actor_name if actor_name != "" else (GameState.hero_name if actor.name == "HeroPlayer" else actor.name)
	var dir = (actor.global_position - global_position).normalized()
	if dir == Vector2.ZERO: dir = Vector2(-1, 0)
	var adjacent_pos = global_position + dir * 55.0

	var execute_disarm = func():
		if actor.has_method("_update_facing"):
			actor._update_facing(global_position)
		elif "sprite" in actor and actor.sprite:
			actor.sprite.flip_h = (global_position.x < actor.global_position.x)
		var res = disarm_trap(a_name, force_fumble)
		if on_complete.is_valid():
			on_complete.call(res)

	if actor.global_position.distance_to(global_position) <= disarm_reach:
		execute_disarm.call()
	elif actor.has_method("approach_and_interact"):
		actor.approach_and_interact(global_position, 55.0, execute_disarm)
	elif actor.has_method("move_to_point"):
		actor.move_to_point(adjacent_pos, execute_disarm)
	elif actor.has_method("move_to"):
		actor.move_to(adjacent_pos)
		get_tree().create_timer(adjacent_pos.distance_to(actor.global_position) / 200.0).timeout.connect(execute_disarm)

# ── Trigger Resolution ────────────────────────────────────────────────────────

func force_trigger(victim_name: String, force_fail_save: bool = false, is_fumble: bool = false, is_physical_step: bool = false) -> Dictionary:
	if is_disarmed or is_triggered:
		return {"triggered": false, "reason": "Already neutralized"}

	var vic_node = _get_actor_node(victim_name)
	if vic_node and not is_fumble:
		var dist = global_position.distance_to(vic_node.global_position)
		var max_dist = 78.0 if is_physical_step else 54.0
		if dist > max_dist:
			GameState.log_message("combat", "⚠️ [TOO FAR] Cannot trigger %s from afar! %s must walk over the trap to trigger it (distance: %d px)." % [trap_name, victim_name, int(dist)])
			return {
				"triggered": false,
				"error": "Must walk over trap to trigger it! %s is too far (%.1f px away)." % [victim_name, dist],
				"too_far": true,
				"distance": dist
			}

	is_triggered = true
	is_detected = true
	GameState.mark_trap_neutralized(_scene_key(), trap_id, "triggered")
	GameState.record_event("trap_triggered", {"trap_id": trap_id, "victim": victim_name, "fumble": is_fumble})
	_update_visual_state()
	_spawn_sprung_vfx()

	if vic_node:
		if vic_node.has_method("_stop_movement"):
			vic_node._stop_movement()
		elif "is_moving" in vic_node:
			vic_node.is_moving = false
			vic_node.velocity = Vector2.ZERO

	var cm = _get_combat_manager()
	var save_bonus = 2
	if victim_name == GameState.hero_name:
		save_bonus = GameState.get_stat_modifier(int(GameState.ability_scores.get(save_stat, 12)))
		var prof_saves = ["STR", "CON"] if GameState.hero_class == "fighter" else (["DEX", "INT"] if GameState.hero_class == "rogue" else ["WIS", "CHA"])
		if prof_saves.has(save_stat):
			save_bonus += 2

	var trig_res = cm.resolve_trap_trigger(victim_name, save_stat, save_bonus, save_dc, damage_dice_min, damage_dice_max, damage_type, status_effect, trap_name, force_fail_save)
	GameState.trap_triggered.emit(trap_id, victim_name)
	trap_triggered.emit(self, victim_name)

	var dmg = trig_res.get("damage", 0)
	if FloatingTextManager:
		FloatingTextManager.spawn_damage(global_position, dmg, false)

	return trig_res

func _spawn_sprung_vfx() -> void:
	var vfx = Node2D.new()
	vfx.top_level = true
	vfx.global_position = global_position

	var ring = Line2D.new()
	ring.width = 4.0
	var col = Color(1.8, 0.5, 0.1, 0.95) if damage_type == "fire" else (Color(0.3, 1.5, 0.4, 0.95) if damage_type == "poison" else Color(1.2, 0.8, 0.2, 0.95))
	ring.default_color = col
	var pts: PackedVector2Array = []
	for i in range(24):
		var a = i * (PI * 2.0 / 24.0)
		pts.append(Vector2(cos(a), sin(a)) * 20.0)
	pts.append(pts[0])
	ring.points = pts
	vfx.add_child(ring)

	for k in range(8):
		var spark = Polygon2D.new()
		spark.polygon = PackedVector2Array([Vector2(-3, -3), Vector2(3, -3), Vector2(3, 3), Vector2(-3, 3)])
		spark.color = col
		var angle = randf() * PI * 2.0
		spark.position = Vector2(cos(angle), sin(angle)) * randf_range(10.0, 35.0)
		vfx.add_child(spark)

	if get_parent():
		get_parent().add_child(vfx)

	var tw = create_tween()
	tw.parallel().tween_property(vfx, "scale", Vector2(2.4, 2.4), 0.35)
	tw.parallel().tween_property(vfx, "modulate:a", 0.0, 0.35)
	tw.tween_callback(vfx.queue_free)

func walk_over_and_trigger(victim_name: String = "", force_fail_save: bool = false, on_complete: Callable = Callable()) -> void:
	var actor = _get_actor_node(victim_name)
	if not actor:
		if on_complete.is_valid():
			on_complete.call({"success": false, "error": "Actor not found"})
		return

	var v_name = victim_name if victim_name != "" else GameState.hero_name
	next_trigger_force_fail_save = force_fail_save

	if global_position.distance_to(actor.global_position) <= 45.0:
		var res = force_trigger(v_name, force_fail_save)
		if on_complete.is_valid():
			on_complete.call(res)
		return

	if actor.has_method("move_to_point"):
		actor.move_to_point(global_position, func():
			if not is_triggered:
				var res = force_trigger(v_name, force_fail_save)
				if on_complete.is_valid():
					on_complete.call(res)
			elif on_complete.is_valid():
				on_complete.call({"success": true, "triggered": true})
		)
	elif actor.has_method("move_to"):
		actor.move_to(global_position)

func _on_body_entered(body: Node2D) -> void:
	if is_disarmed or is_triggered:
		return
	if body.name.to_lower().contains("ghost") or body.name.to_lower().contains("npc"):
		return
	if body is CharacterBody2D:
		var v_name = GameState.hero_name
		if body.get("companion_name"):
			v_name = str(body.get("companion_name"))
		elif body.name != "HeroPlayer" and "name" in body:
			v_name = str(body.name)
		var fail_save = next_trigger_force_fail_save
		next_trigger_force_fail_save = false
		force_trigger(v_name, fail_save, false, true)

func _input_event(_viewport: Viewport, event: InputEvent, _shape_idx: int) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var cur_sc = get_tree().current_scene if get_tree() else null
		var hero = cur_sc.find_child("HeroPlayer", true, false) if cur_sc else null
		if is_disarmed:
			GameState.log_message("system", "* %s has already been disarmed." % trap_name)
			return
		if is_triggered:
			GameState.log_message("system", "* %s has already been sprung." % trap_name)
			return
		if is_detected:
			var disarmer = GameState.get_thief_member_name()
			GameState.log_message("system", "* %s approaches to disarm %s..." % [disarmer, trap_name])
			approach_and_disarm(disarmer)
		else:
			if hero and hero.has_method("move_to_point"):
				hero.move_to_point(get_global_mouse_position())

func get_trap_info() -> Dictionary:
	var appearing = visible and not is_vanishing and not is_disarmed and not is_triggered and not is_queued_for_deletion()
	var is_fow_revealed = true
	var cur_sc = get_tree().current_scene if get_tree() else null
	if cur_sc:
		var fow = cur_sc.find_child("FogOfWar", true, false)
		if fow and fow.has_method("is_point_explored") and fow.has_method("_is_fog_enabled"):
			if fow._is_fog_enabled():
				is_fow_revealed = fow.is_point_explored(global_position) or fow.is_point_in_vision(global_position)
	return {
		"id": trap_id,
		"name": trap_name,
		"type": trap_type,
		"is_detected": is_detected,
		"is_disarmed": is_disarmed,
		"is_triggered": is_triggered,
		"is_appearing_on_map": appearing,
		"is_revealed_by_fog_of_war": is_fow_revealed,
		"visible": visible and not is_vanishing and not is_neutralized(),
		"node_visible": visible,
		"modulate_alpha": modulate.a,
		"collision_disabled": collision_shape.disabled if collision_shape else true,
		"monitoring": monitoring,
		"input_pickable": input_pickable,
		"label_visible": label.visible if label else false,
		"detect_dc": detect_dc,
		"disarm_dc": disarm_dc,
		"disarm_reach": disarm_reach,
		"save_stat": save_stat,
		"save_dc": save_dc,
		"position": [global_position.x, global_position.y]
	}

func _get_combat_manager() -> CombatManager:
	var cur_sc = get_tree().current_scene if get_tree() else null
	if cur_sc:
		var cm = cur_sc.find_child("CombatManager", true, false)
		if cm and cm is CombatManager:
			return cm
	return CombatManager.new()
