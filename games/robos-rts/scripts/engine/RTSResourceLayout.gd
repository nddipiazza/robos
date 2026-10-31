extends RefCounted

# Standard resource pockets in the game's world units. Rotate the complete
# crescent, never scatter individual patches around water or cliff edges.
const CLOSE_RADIUS := 12.3
const FAR_RADIUS := 14.3
const GAS_OFFSET := 13.1
const PATCH_AMOUNTS := [900, 1800]

static func crescent(base: Vector2, facing: Vector2, prefix: String, half_angle := 63.0, rich := false) -> Array:
	var outward := facing.normalized() if facing.length_squared() > 0 else Vector2.LEFT
	var tangent := Vector2(-outward.y, outward.x)
	var result: Array = []
	for i in range(8):
		var radius: float = CLOSE_RADIUS if i % 2 == 0 else FAR_RADIUS
		var angle := deg_to_rad(lerpf(-half_angle, half_angle, float(i) / 7.0))
		var pos := base + outward.rotated(angle) * radius
		result.append({"id":"%s_crystal_%d" % [prefix,i], "site_id":prefix, "type":"crystal_field",
			"x":snappedf(pos.x,0.001), "y":snappedf(pos.y,0.001), "amount":PATCH_AMOUNTS[i % 2], "rich":rich})
	for side in [-1,1]:
		var pos: Vector2 = base + tangent * side * GAS_OFFSET
		result.append({"id":"%s_aether_%d" % [prefix,side], "site_id":prefix, "type":"aether_vent",
			"x":snappedf(pos.x,0.001), "y":snappedf(pos.y,0.001), "amount":2250})
	return result

static func for_map(map: Dictionary) -> Array:
	var context := _land_context(map)
	var sites: Array = map.get("starts",[]) + map.get("expansions",[])
	var result: Array = []
	for index in range(sites.size()):
		var site: Dictionary = sites[index]
		var base := Vector2(float(site.x),float(site.y))
		var away := base - Vector2(float(map.get("width",256)),float(map.get("height",256))) * 0.5
		var preferred := Vector2(signf(away.x),0) if absf(away.x) > absf(away.y) else Vector2(0,signf(away.y))
		if preferred == Vector2.ZERO: preferred = Vector2.LEFT
		if site.has("resource_facing"):
			preferred = {"west":Vector2.LEFT,"east":Vector2.RIGHT,"north":Vector2.UP,"south":Vector2.DOWN}.get(site.resource_facing,preferred)
		var selected: Array = []
		for turn in [0,1,-1,2]:
			var facing := preferred.rotated(float(turn) * PI * 0.5)
			for angle in [63.0,56.0]:
				var candidate := crescent(base,facing,"start_%d" % index,angle,bool(site.get("rich_crystal",false)))
				if candidate.all(func(r):return _clear(Vector2(r.x,r.y),1.8 if r.type=="crystal_field" else 2.6,context)):
					selected = candidate
					break
			if not selected.is_empty(): break
		if selected.is_empty():
			push_error("Resource crescent does not fit site %d at %s; move the base or edit its terrain." % [index,base])
		else:
			result.append_array(selected)
	return result

static func _land_context(map: Dictionary) -> Dictionary:
	var water: Dictionary = {}
	var polygons: Array = []
	var bridges: Array = []
	for r in map.get("bridges",[]): bridges.append(Rect2(float(r.x),float(r.y),float(r.w),float(r.h)))
	for channel in map.get("water_channels",[]):
		var points := PackedVector2Array()
		for p in channel.points: points.append(Vector2(float(p[0]),float(p[1])))
		if points.size()>=2:
			polygons.append_array(Geometry2D.offset_polyline(points,float(channel.width)*0.5,Geometry2D.JOIN_ROUND,Geometry2D.END_ROUND))
	var width: float = float(map.get("width",256))
	var height: float = float(map.get("height",256))
	if not polygons.is_empty():
		for x in range(int(ceil(width/2))):
			for y in range(int(ceil(height/2))):
				var pos := Vector2(x+0.5,y+0.5)*2.0
				if not bridges.any(func(r):return r.has_point(pos)) and polygons.any(func(p):return Geometry2D.is_point_in_polygon(pos,p)):
					water[Vector2i(x,y)] = true
	var obstacles: Array = []
	for r in map.get("obstacles",[]): obstacles.append(Rect2(float(r.x),float(r.y),float(r.w),float(r.h)))
	for tile in map.get("terrain_tiles",[]):
		var rect := Rect2(float(tile.x),float(tile.y),4,4)
		if tile.terrain=="cliff": obstacles.append(rect)
		for x in range(int(rect.position.x/2),int(rect.end.x/2)):
			for y in range(int(rect.position.y/2),int(rect.end.y/2)):
				if tile.terrain=="water": water[Vector2i(x,y)]=true
				else: water.erase(Vector2i(x,y))
	return {"water":water,"obstacles":obstacles,"width":width,"height":height}

static func _clear(pos: Vector2, radius: float, context: Dictionary) -> bool:
	if pos.x < radius+1 or pos.y < radius+1 or pos.x > context.width-radius-1 or pos.y > context.height-radius-1: return false
	for r in context.obstacles:
		if r.grow(radius).has_point(pos): return false
	for x in range(int(floor((pos.x-radius)/2)),int(floor((pos.x+radius)/2))+1):
		for y in range(int(floor((pos.y-radius)/2)),int(floor((pos.y+radius)/2))+1):
			if context.water.has(Vector2i(x,y)):
				var nearest := Vector2(clampf(pos.x,x*2,(x+1)*2),clampf(pos.y,y*2,(y+1)*2))
				if nearest.distance_squared_to(pos)<=radius*radius: return false
	return true
