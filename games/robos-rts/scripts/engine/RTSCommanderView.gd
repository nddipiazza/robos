extends RefCounted

# A conservative footprint inside the normal gameplay camera at its default zoom.
const HALF_VIEW := Vector2(26.0, 16.0)
const PAN_TICKS := 16

var center := Vector2.INF
var ready_tick := 0
var hold_until := 0
var selection_pan := false
var selected := {}
var buildings := {}

func contains(point: Vector2, tick: int) -> bool:
	return tick >= ready_tick and Rect2(center - HALF_VIEW, HALF_VIEW * 2.0).has_point(point)

func focus(point: Vector2, tick: int, cadence: int) -> bool:
	if contains(point, tick):
		return true
	if point.is_finite() and tick >= hold_until:
		center = point
		ready_tick = tick + PAN_TICKS
		hold_until = ready_tick + cadence
	return false

func acted(tick: int) -> void:
	hold_until = tick
	selection_pan = false
