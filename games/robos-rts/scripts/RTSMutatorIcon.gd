extends Control

var kind := ""

func _draw() -> void:
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE * 1.25)
	var tint := Color("#82d7e6")
	match kind:
		"barrier", "mineral_shields":
			if kind == "mineral_shields":
				tint = Color("#ffd077")
				_trace([Vector2(8, 12), Vector2(12, 8), Vector2(16, 12), Vector2(12, 17), Vector2(8, 12)], tint)
			_trace([Vector2(12, 2), Vector2(21, 6), Vector2(20, 15), Vector2(12, 22),
				Vector2(4, 15), Vector2(3, 6), Vector2(12, 2)], tint)
		"black_death":
			tint = Color("#bce579")
			draw_circle(Vector2(12, 12), 2.7, tint)
			for angle in [0.0, TAU / 3.0, TAU * 2.0 / 3.0]:
				var center := Vector2(12, 12) + Vector2.from_angle(angle) * 6.3
				draw_arc(center, 4.2, angle - 2.1, angle + 2.1, 14, tint, 1.7, true)
		"time_warp":
			tint = Color("#c2a7fc")
			draw_arc(Vector2(12, 12), 9, 0, TAU, 24, tint, 1.6, true)
			_trace([Vector2(12, 6), Vector2(12, 12), Vector2(17, 15)], tint)
		"going_nuclear", "self_destruction":
			tint = Color("#ff9d7d")
			draw_circle(Vector2(12, 12), 2.5, tint)
			for index in (3 if kind == "going_nuclear" else 6):
				var direction := Vector2.from_angle(-PI / 2 + TAU * index / (3.0 if kind == "going_nuclear" else 6.0))
				if kind == "going_nuclear":
					var angle := direction.angle()
					draw_arc(Vector2(12, 12), 8.0, angle - 0.47, angle + 0.47, 10, tint, 4.2, true)
				else:
					draw_line(Vector2(12, 12) + direction * 4.0, Vector2(12, 12) + direction * 10.0, tint, 1.8, true)
		"speed_freaks":
			for x in [3, 10, 17]:
				_trace([Vector2(x - 2, 6), Vector2(x + 4, 12), Vector2(x - 2, 18)], tint)
		"long_range":
			draw_arc(Vector2(12, 12), 7.0, 0.0, TAU, 24, tint, 1.6, true)
			for angle in [0, PI / 2, PI, 3 * PI / 2]:
				var direction := Vector2.from_angle(angle)
				draw_line(Vector2(12, 12) + direction * 5, Vector2(12, 12) + direction * 11, tint, 1.6, true)
		"concussive_attacks":
			_trace([Vector2(3, 16), Vector2(8, 16), Vector2(12, 5), Vector2(15, 20), Vector2(18, 12), Vector2(22, 12)], tint)
		"just_die":
			draw_arc(Vector2(12, 12), 8.0, -0.7, 4.25, 24, tint, 1.8, true)
			_trace([Vector2(5, 6), Vector2(8, 4), Vector2(8, 9)], tint)
		"walking_infested":
			tint = Color("#bce579")
			draw_circle(Vector2(12, 12), 4.5, tint)
			for y in [5, 12, 19]:
				_trace([Vector2(4, y), Vector2(8, 12), Vector2(16, 12), Vector2(20, y)], tint)
		"scorched_earth":
			tint = Color("#ffc176")
			_trace([Vector2(12, 2), Vector2(16, 10), Vector2(19, 8), Vector2(21, 16),
				Vector2(17, 21), Vector2(7, 21), Vector2(3, 16), Vector2(7, 9), Vector2(8, 14), Vector2(12, 2)], tint)
		"life_leech":
			tint = Color("#ee9bb1")
			_trace([Vector2(12, 20), Vector2(3, 11), Vector2(3, 7), Vector2(7, 4), Vector2(12, 7),
				Vector2(17, 4), Vector2(21, 7), Vector2(21, 11), Vector2(12, 20)], tint)
		"shortsighted":
			_trace([Vector2(2, 12), Vector2(7, 7), Vector2(17, 7), Vector2(22, 12),
				Vector2(17, 17), Vector2(7, 17), Vector2(2, 12)], tint)
			_trace([Vector2(4, 21), Vector2(20, 3)], tint)
		_:
			tint = Color("#698093")
			draw_arc(Vector2(12, 10), 4.1, PI, TAU, 14, tint, 1.6, true)
			draw_rect(Rect2(6, 10, 12, 9), tint, false, 1.6)

func _trace(points: Array, tint: Color) -> void:
	draw_polyline(PackedVector2Array(points), tint, 1.7, true)
