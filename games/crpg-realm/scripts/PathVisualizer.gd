extends Node2D
class_name PathVisualizer

## PathVisualizer: Infinity Engine & tactical cRPG glowing pathfinding & waypoint renderer.
## Renders multi-segment glowing path lines, animated flow beads, arrival ripples,
## and numbered waypoint node badges in global world space.

var hero: Node2D = null
var flow_offset: float = 0.0

var bursts: Array[Dictionary] = []

func _ready() -> void:
	top_level = true
	z_index = 6
	hero = get_parent() as Node2D

func spawn_arrival_burst(burst_pos: Vector2, burst_color: Color = Color(0.2, 1.0, 0.6, 1.0)) -> void:
	bursts.append({
		"pos": burst_pos,
		"radius": 10.0,
		"max_radius": 34.0,
		"alpha": 1.0,
		"speed": 60.0,
		"color": burst_color
	})
	queue_redraw()

func _process(delta: float) -> void:
	flow_offset += delta * 75.0

	# Update arrival burst animations
	var i = bursts.size() - 1
	var has_bursts = false
	while i >= 0:
		var b = bursts[i]
		b["radius"] += float(b["speed"]) * delta
		b["alpha"] = max(0.0, float(b["alpha"]) - delta * 3.5)
		if b["alpha"] <= 0.0 or b["radius"] >= b["max_radius"]:
			bursts.remove_at(i)
		else:
			has_bursts = true
		i -= 1

	var is_hero_moving = false
	if hero:
		var target_pos = hero.get("target_position")
		var wp_queue = hero.get("waypoint_queue")
		if target_pos != null and target_pos != Vector2.ZERO:
			is_hero_moving = true
		elif wp_queue != null and wp_queue.size() > 0:
			is_hero_moving = true

	if is_hero_moving or has_bursts:
		visible = true
		queue_redraw()
	else:
		visible = false

func _draw() -> void:
	# 1. Draw Arrival Bursts
	for b in bursts:
		var b_pos: Vector2 = b["pos"]
		var b_rad: float = b["radius"]
		var b_alpha: float = b["alpha"]
		var b_col: Color = b["color"]
		draw_arc(b_pos, b_rad, 0.0, TAU, 32, Color(b_col.r, b_col.g, b_col.b, b_alpha), 2.5, true)
		draw_circle(b_pos, 3.5, Color(1.0, 1.0, 1.0, b_alpha))

	if not hero:
		return

	var target_pos: Vector2 = hero.get("target_position") if hero.get("target_position") != null else Vector2.ZERO
	var wp_queue: Array = hero.get("waypoint_queue") if hero.get("waypoint_queue") != null else []

	if target_pos == Vector2.ZERO and wp_queue.is_empty():
		return

	# 2. Collect Path Points
	var pts: PackedVector2Array = []
	# Start at hero's feet
	pts.append(hero.global_position + Vector2(0, 16))
	if target_pos != Vector2.ZERO:
		pts.append(target_pos)
	for wp in wp_queue:
		pts.append(wp)

	if pts.size() < 2:
		return

	# 3. Glowing Polyline Layers
	# Outer ambient glow
	draw_polyline(pts, Color(0.0, 0.7, 1.0, 0.32), 7.0, true)
	# Mid neon beam
	draw_polyline(pts, Color(0.1, 0.85, 1.0, 0.65), 3.5, true)
	# Core crisp white line
	draw_polyline(pts, Color(0.92, 0.98, 1.0, 0.95), 1.5, true)

	# 4. Animated Flow Beads (traveling along the path in direction of movement)
	for seg_idx in range(pts.size() - 1):
		var p1 = pts[seg_idx]
		var p2 = pts[seg_idx + 1]
		var seg_len = p1.distance_to(p2)
		if seg_len < 12.0:
			continue
		var dir = (p2 - p1) / seg_len
		var spacing = 28.0
		var cur_d = fmod(flow_offset, spacing)
		while cur_d < seg_len:
			var b_pos = p1 + dir * cur_d
			draw_circle(b_pos, 4.0, Color(0.0, 0.85, 1.0, 0.38))
			draw_circle(b_pos, 2.0, Color(1.0, 1.0, 1.0, 0.95))
			cur_d += spacing

	# 5. Waypoint & Destination Node Markers
	var font = ThemeDB.fallback_font

	if wp_queue.size() > 0:
		# Multi-waypoint Queue Mode
		# Current active target is Waypoint #1
		_draw_waypoint_badge(target_pos, "1", Color(0.0, 0.9, 1.0, 0.95), font)

		for k in range(wp_queue.size()):
			var wp_pos: Vector2 = wp_queue[k]
			var wp_num = str(k + 2)
			var is_final = (k == wp_queue.size() - 1)
			if is_final:
				_draw_destination_marker(wp_pos, wp_num, font)
			else:
				_draw_waypoint_badge(wp_pos, wp_num, Color(0.0, 0.85, 1.0, 0.95), font)
	else:
		# Single Target Destination Marker
		_draw_destination_marker(target_pos, "", font)

func _draw_waypoint_badge(pos: Vector2, text: String, border_color: Color, font: Font) -> void:
	draw_circle(pos, 13.0, Color(0.03, 0.12, 0.22, 0.9))
	draw_arc(pos, 13.0, 0.0, TAU, 24, border_color, 2.0, true)
	draw_circle(pos, 3.0, Color(1.0, 1.0, 1.0, 0.9))
	if font and text != "":
		draw_string(font, pos + Vector2(-16, -18), "WP %s" % text, HORIZONTAL_ALIGNMENT_CENTER, 32, 10, Color(1.0, 0.95, 0.4, 1.0))

func _draw_destination_marker(pos: Vector2, text: String, font: Font) -> void:
	var pulse = sin(Time.get_ticks_msec() * 0.008) * 2.5
	var r_outer = 16.0 + pulse
	draw_circle(pos, r_outer, Color(0.02, 0.18, 0.08, 0.8))
	draw_arc(pos, r_outer, 0.0, TAU, 32, Color(0.2, 1.0, 0.5, 0.95), 2.5, true)
	draw_arc(pos, 8.0, 0.0, TAU, 20, Color(1.0, 0.9, 0.2, 0.85), 1.5, true)
	draw_circle(pos, 3.5, Color(1.0, 1.0, 1.0, 1.0))

	# 4 Crosshair ticks
	for ang in [0.0, PI * 0.5, PI, PI * 1.5]:
		var tick_in = pos + Vector2(cos(ang), sin(ang)) * (r_outer + 1.0)
		var tick_out = pos + Vector2(cos(ang), sin(ang)) * (r_outer + 7.0)
		draw_line(tick_in, tick_out, Color(0.2, 1.0, 0.5, 0.9), 2.0, true)

	var label_str = "GOAL #%s" % text if text != "" else "TARGET"
	if font:
		draw_string(font, pos + Vector2(-24, -22), label_str, HORIZONTAL_ALIGNMENT_CENTER, 48, 10, Color(0.4, 1.0, 0.6, 1.0))
