extends SceneTree

func _init() -> void:
	var fow_scene = load('res://scenes/VillageSquare.tscn')
	var vs = fow_scene.instantiate()
	root.add_child(vs)
	
	var fow = vs.get_node('FogOfWar')
	print('FogOfWar node: ', fow)
	print('FogOfWar z_index: ', fow.z_index, ' z_as_relative: ', fow.z_as_relative)
	var rect = fow.get_node('FogDisplay')
	print('FogDisplay rect: ', rect, ' size: ', rect.size, ' visible: ', rect.visible)
	print('Material: ', rect.material)
	print('Texture: ', rect.texture)
	
	quit(0)
