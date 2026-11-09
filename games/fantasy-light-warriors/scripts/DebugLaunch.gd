extends Node

const SCENE_MAP := {
	"TitleScreen": "res://scenes/TitleScreen.tscn",
	"PartyCreate": "res://scenes/PartyCreate.tscn",
	"Coneria": "res://scenes/Coneria.tscn",
	"ConeriaCastle1F": "res://scenes/ConeriaCastle1F.tscn",
	"ConeriaCastle2F": "res://scenes/ConeriaCastle2F.tscn",
	"TempleOfFiends": "res://scenes/TempleOfFiends.tscn",
	"WorldMap": "res://scenes/WorldMap.tscn"
}

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var scene := "TitleScreen"
	var tile := Vector2i(-1, -1)
	var facing := ""
	var tile_debug := false
	var auto_play := false
	var until_m := 0
	var i := 0
	while i < args.size():
		var k := str(args[i])
		var has_val := (i + 1 < args.size())
		match k:
			"--scene":
				if has_val: scene = str(args[i + 1]); i += 2
				else: i += 1
			"--tile":
				if has_val:
					var p := str(args[i + 1]).split(",")
					if p.size() >= 2:
						tile = Vector2i(p[0].to_int(), p[1].to_int())
					i += 2
				else: i += 1
			"--facing":
				if has_val: facing = str(args[i + 1]); i += 2
				else: i += 1
			"--tile-debug":
				tile_debug = true
				i += 1
			"--play-game":
				auto_play = true
				i += 1
			"--until-milestone":
				if has_val: until_m = str(args[i + 1]).to_int(); i += 2
				else: i += 1
			_:
				i += 1

	var gs := get_node_or_null("/root/GameState")
	if gs:
		if tile != Vector2i(-1, -1):
			gs.spawn_tile = tile
		if facing != "":
			gs.spawn_facing = facing
		gs.tile_debug_enabled = tile_debug

	var path: String = SCENE_MAP.get(scene, "res://scenes/%s.tscn" % scene)
	get_tree().call_deferred("change_scene_to_file", path)
	if auto_play:
		var brain := get_node_or_null("/root/PlayGameBrain")
		if brain:
			brain.call_deferred("start", until_m, 0)
