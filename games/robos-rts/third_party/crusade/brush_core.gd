class_name RTSBrushCore
extends RefCounted
## Pure brush decision logic for the in-game map editor. The MapEditor node translates input into these calls and applies the result to a TileMapLayer; ALL testable brush behavior lives here.

## Brush interaction mode: PAINT writes the target tile, ERASE clears the cell.
enum Mode { PAINT, ERASE }

## Decision emitted by resolve(): do NOTHING, WRITE the target tile, or CLEAR the cell.
enum Action { NONE, WRITE, CLEAR }

const EMPTY_SOURCE_ID := -1  ## Godot's "no tile" sentinel. NEVER test emptiness against 0 (source_id 0 is a valid source).

## True when a cell has no tile. The ONLY place the -1 rule is encoded.
static func is_empty(source_id: int) -> bool:
	return source_id == EMPTY_SOURCE_ID

## Decides what a brush stroke should do at one cell given its current contents
## and the target tile. Returns { "action": Action, "source_id": int, "atlas_coords": Vector2i }.
## PAINT is idempotent (repainting the identical tile is a NONE no-op); ERASE on an
## already-empty cell is a NONE no-op. The `match` default returns a defensive NONE.
static func resolve(mode: Mode, current_source_id: int, current_atlas: Vector2i, target_source_id: int, target_atlas: Vector2i) -> Dictionary:
	match mode:
		Mode.PAINT:
			if current_source_id == target_source_id and current_atlas == target_atlas:
				return { "action": Action.NONE, "source_id": current_source_id, "atlas_coords": current_atlas }
			return { "action": Action.WRITE, "source_id": target_source_id, "atlas_coords": target_atlas }
		Mode.ERASE:
			if is_empty(current_source_id):
				return { "action": Action.NONE, "source_id": EMPTY_SOURCE_ID, "atlas_coords": current_atlas }
			return { "action": Action.CLEAR, "source_id": EMPTY_SOURCE_ID, "atlas_coords": Vector2i(-1, -1) }
	return { "action": Action.NONE, "source_id": current_source_id, "atlas_coords": current_atlas }

## Clamps a level index into [0, count-1]. Guards an empty set (count <= 0) by returning 0.
static func clamp_level(level: int, count: int) -> int:
	if count <= 0:
		return 0
	return clampi(level, 0, count - 1)

## Cycles a level index by `delta`, wrapping within [0, count). Guards an empty set (count <= 0) by returning 0.
static func cycle_level(level: int, delta: int, count: int) -> int:
	if count <= 0:
		return 0
	return wrapi(level + delta, 0, count)
