extends Node2D
## DemoMode.gd — Host scene for ScenarioArena in Demo Arena mode.
## The persistent UI bar, drawer, and runner are managed by DemoController autoload.

const ArenaScene := preload("res://scenes/ScenarioArena.tscn")
var arena: Node2D

func _ready() -> void:
	arena = ArenaScene.instantiate()
	add_child(arena)
	if has_node("/root/DemoController"):
		var dc = get_node("/root/DemoController")
		if not dc.is_active:
			dc.start_demo(dc.Mode.DEMO)
