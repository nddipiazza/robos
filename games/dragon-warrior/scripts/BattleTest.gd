## BattleTest — drops straight into a battle overlay for debug purposes.
## Reads GameState.battle_monster and overridden hero stats set by DebugLaunch.
extends Node2D

const BATTLE_SCENE := "res://scenes/BattleOverlay.tscn"

func _ready() -> void:
	var gs       : Node   = get_node_or_null("/root/GameState")
	var mon_key  : String = ""
	var mon_data : Dictionary = {}

	if gs:
		mon_key = str(gs.battle_monster) if str(gs.battle_monster) != "" else "slime"

	# Load monster data from v1 schema / DataManager
	mon_data = DataManager.get_monster(mon_key)
	if mon_data.is_empty():
		var f := FileAccess.open("res://data/v1/monsters.json", FileAccess.READ)
		if f:
			var parsed: Variant = JSON.parse_string(f.get_as_text())
			var store := MonstersDataStoreV1.from_value(parsed)
			if store:
				for m in store.value:
					if m.key == mon_key:
						mon_data = m.to_value()
						break

	if mon_data.is_empty():
		push_error("BattleTest: unknown monster key '%s'" % mon_key)
		get_tree().quit()
		return

	var overlay : Node = load(BATTLE_SCENE).instantiate()
	add_child(overlay)
	overlay.call("start_battle", mon_key, mon_data)
	overlay.connect("battle_ended", func(result: String):
		print("[BattleTest] battle ended: %s" % result)
		overlay.queue_free()
		await get_tree().create_timer(1.0).timeout
		get_tree().quit()
	)
