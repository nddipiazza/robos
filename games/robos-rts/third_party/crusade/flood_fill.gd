class_name RTSFloodFill
extends RefCounted
## Pure ITERATIVE flood fill over an abstract cell space -- the core of the Bucket Fill tool.
## Never recursive (recursion stack-overflows on large fills); uses an explicit BFS queue +
## a visited Dictionary. Node-free and headless-testable: the caller injects `read` and
## `neighbors` Callables, so this same logic drives an in-memory grid in tests and a live
## TileMapLayer at runtime (iso neighbor topology differs -- never hardcode offsets).

## Reads a cell's CURRENT identity. Contract:
##   read: func(cell: Vector2i) -> Dictionary { "src": int, "atlas": Vector2i }
## `src` is the tile source id (-1 == empty, per BrushCore.EMPTY_SOURCE_ID; NEVER 0),
## `atlas` its atlas coords. At runtime this wraps
## get_cell_source_id(cell)/get_cell_atlas_coords(cell); in tests an in-memory Dictionary
## lookup defaulting absent cells to { "src": -1, "atlas": Vector2i(-1, -1) }.
##
## Returns adjacent cells. Contract:
##   neighbors: func(cell: Vector2i) -> Array[Vector2i]
## At runtime wraps TileMapLayer.get_surrounding_cells(cell) (respects iso topology); in
## tests a deterministic 4-neighbor (N/E/S/W) function. Offsets are NEVER hardcoded here.

## Computes the contiguous region of the SEED's original identity `(match_src, match_atlas)`
## reachable from `seed` via `neighbors`, iteratively (BFS). A cell is part of the region iff
## `read(cell).src == match_src and read(cell).atlas == match_atlas`. `match_src`/`match_atlas`
## are captured by the CALLER (the seed's current contents) and held fixed -- nothing mutates
## during compute (read-only), so the seed's identity is not re-read as the walk proceeds.
##
## Guards:
##   - bounds: only cells with `bounds.has_point(cell)` are ever considered/enqueued. This
##     bounds an otherwise-infinite TileMapLayer (filling empty space would never terminate).
##   - max_cells: hard cap. Once the result reaches `max_cells` we stop and return a PARTIAL
##     region -- a defensive termination guarantee even inside finite bounds.
##   - Out-of-bounds seed -> returns []. The seed defines the matched identity, so an in-bounds
##     seed is always included.
## Returns a typed Array[Vector2i] in deterministic BFS order.
static func compute(
		seed: Vector2i,
		match_src: int,
		match_atlas: Vector2i,
		bounds: Rect2i,
		read: Callable,
		neighbors: Callable,
		max_cells: int) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	# Out-of-bounds seed, or a non-positive cap, yields nothing.
	if not bounds.has_point(seed) or max_cells <= 0:
		return result

	var visited: Dictionary = {}   ## Vector2i -> true; a cell is enqueued at most once.
	var queue: Array[Vector2i] = [seed]
	visited[seed] = true
	var cursor: int = 0            ## Index pointer instead of pop_front (which is O(n)).

	while cursor < queue.size():
		var cell: Vector2i = queue[cursor]
		cursor += 1

		# Match against the seed's captured identity. The seed itself is included by fiat
		# (it defines the identity) but re-reading it is harmless and keeps the loop uniform.
		var here: Dictionary = read.call(cell)
		if here["src"] != match_src or here["atlas"] != match_atlas:
			continue

		result.append(cell)
		# Cap hit: return the partial region and terminate immediately.
		if result.size() >= max_cells:
			return result

		for n: Vector2i in neighbors.call(cell):
			# A cell outside bounds is never enqueued (infinite-space guard); skip visited.
			if visited.has(n) or not bounds.has_point(n):
				continue
			visited[n] = true
			queue.append(n)

	return result
