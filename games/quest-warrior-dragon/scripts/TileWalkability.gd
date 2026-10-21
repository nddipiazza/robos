extends Node
## Shared tile walkability registry loaded from data/tile_walkability.json.
## Registered as an autoload so every scene can call TileWalkability.is_walkable().

var _walkable: Dictionary = {}

func _ready() -> void:
	var f := FileAccess.open("res://data/v1/tile_walkability.json", FileAccess.READ)
	if not f:
		push_error("TileWalkability: cannot open tile_walkability.json")
		return
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if parsed == null or not parsed.has("walkable"):
		push_error("TileWalkability: malformed tile_walkability.json")
		return
	for id in parsed["walkable"]:
		_walkable[int(id)] = true

func is_walkable(tile_id: int) -> bool:
	return _walkable.has(tile_id)
