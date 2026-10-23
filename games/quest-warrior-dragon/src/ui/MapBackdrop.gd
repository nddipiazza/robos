class_name MapBackdrop
## Fills the screen outside a town / dungeon / castle map with that map's own border tile,
## the way the NES keeps drawing grass (or wall) past a town's edge. Without it the camera
## shows the empty grey viewport whenever the hero walks near the edge of a map.

## Adds the backdrop as a child of `bg` drawn behind it, so it follows every camera move.
## `img` is the map image `bg` shows, `tile_px` its tile size in pixels, `tile_size` the
## on-screen tile size. The border tile is the map's top-left tile.
static func attach(bg: TextureRect, img: Image, tile_px: int, tile_size: int, margin_tiles: int = 12) -> void:
	if bg == null or img == null or tile_px <= 0 or img.get_width() < tile_px or img.get_height() < tile_px:
		return
	var tile := img.get_region(Rect2i(0, 0, tile_px, tile_px))
	if tile_px != tile_size:
		tile.resize(tile_size, tile_size, Image.INTERPOLATE_NEAREST)
	var tr := TextureRect.new()
	tr.name = "OutsideBackdrop"
	tr.texture = ImageTexture.create_from_image(tile)
	tr.stretch_mode = TextureRect.STRETCH_TILE
	tr.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tr.show_behind_parent = true
	var m := float(margin_tiles * tile_size)
	tr.position = Vector2(-m, -m)
	tr.size = bg.size + Vector2(m * 2.0, m * 2.0)
	bg.add_child(tr)
