"""Rasterises map objects onto the 5-ft combat grid.

Cell (c, r) covers feet [c*5, c*5+5) x [r*5, r*5+5). A creature standing at
(x, y) feet occupies cell (floor(x/5), floor(y/5)), which is how the scenario
engine reads the grid.

The blockout grid is the single source of map geometry for the engine:
  blocked    cells no creature can enter
  opaque     cells that block line of sight
  difficult  cells that cost double movement
  cover      cells that give half or three-quarters cover to a target behind them
"""

from __future__ import annotations

import hashlib
import json
import math

from .model import BattleMap, MapObject, GRID_FT, OBJECT_TYPES, SHAPES, TERRAINS, COVER_LEVELS


def grid_dims(m: BattleMap) -> tuple[int, int]:
    # Positions may sit on the far edge (x == width), so include that column/row
    return int(m.width // GRID_FT) + 1, int(m.height // GRID_FT) + 1


def object_cells(o: MapObject, cols: int, rows: int) -> set[tuple[int, int]]:
    cells: set[tuple[int, int]] = set()
    if o.shape == "rect":
        x0, y0 = o.position
        x1, y1 = x0 + o.size[0], y0 + o.size[1]
        for c in range(max(0, int(x0 // GRID_FT)), min(cols, int(math.ceil(x1 / GRID_FT)))):
            for r in range(max(0, int(y0 // GRID_FT)), min(rows, int(math.ceil(y1 / GRID_FT)))):
                if c * GRID_FT < x1 and c * GRID_FT + GRID_FT > x0 and r * GRID_FT < y1 and r * GRID_FT + GRID_FT > y0:
                    cells.add((c, r))
    elif o.shape == "circle":
        cx, cy = o.position
        cells.add((int(cx // GRID_FT), int(cy // GRID_FT)))
        for c in range(cols):
            for r in range(rows):
                if math.hypot(c * GRID_FT + 2.5 - cx, r * GRID_FT + 2.5 - cy) <= o.radius:
                    cells.add((c, r))
    elif o.shape == "line":
        (x0, y0), (x1, y1) = o.position, o.to
        length = math.hypot(x1 - x0, y1 - y0)
        steps = max(1, int(length / 0.5))
        nx, ny = ((y0 - y1) / length, (x1 - x0) / length) if length > 0 else (0.0, 0.0)
        half_extra = max(0.0, o.thickness / 2 - GRID_FT / 2)
        offsets = [0.0]
        k = 0.5
        while k <= half_extra:
            offsets += [k, -k]
            k += 0.5
        for i in range(steps + 1):
            t = i / steps
            px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            for off in offsets:
                cells.add((int((px + nx * off) // GRID_FT), int((py + ny * off) // GRID_FT)))
    elif o.shape == "polygon" and len(o.points) >= 3:
        for c in range(cols):
            for r in range(rows):
                if _point_in_polygon(c * GRID_FT + 2.5, r * GRID_FT + 2.5, o.points):
                    cells.add((c, r))
    return {(c, r) for c, r in cells if 0 <= c < cols and 0 <= r < rows}


def _point_in_polygon(x: float, y: float, pts: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi:
            inside = not inside
        j = i
    return inside


def objects_hash(m: BattleMap) -> str:
    payload = json.dumps([o.to_node() for o in m.objects] + [m.width, m.height], sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def compute_blockout(m: BattleMap) -> dict:
    """Builds the collision grid the scenario engine reads. Doors are applied last:
    an open door carves a passage through the wall under it, a closed one seals it."""
    cols, rows = grid_dims(m)
    blocked: set = set()
    opaque: set = set()
    difficult: set = set()
    cover: dict[str, set] = {"half": set(), "three-quarters": set()}
    ordered = [o for o in m.objects if o.type != "door"] + [o for o in m.objects if o.type == "door"]
    for o in ordered:
        rules = o.rules()
        cells = object_cells(o, cols, rows)
        if o.type == "door":
            for cell in cells:
                blocked.discard(cell)
                opaque.discard(cell)
                for s in cover.values():
                    s.discard(cell)
        if rules["blocksMovement"]:
            blocked |= cells
        if rules["blocksSight"]:
            opaque |= cells
        if rules["difficult"]:
            difficult |= cells
        if rules["cover"] in cover:
            cover[rules["cover"]] |= cells

    def as_list(s):
        return [list(c) for c in sorted(s)]

    return {
        "gridSize": GRID_FT,
        "cols": cols,
        "rows": rows,
        "blocked": as_list(blocked),
        "opaque": as_list(opaque),
        "difficult": as_list(difficult - blocked),
        "cover": {k: as_list(v) for k, v in cover.items()},
        "objectsHash": objects_hash(m),
    }


def validate(m: BattleMap) -> tuple[list[str], list[str]]:
    """Returns (errors, warnings)."""
    errors: list[str] = []
    warnings: list[str] = []
    if m.width <= 0 or m.height <= 0:
        errors.append("map width and height must be positive (feet)")
    if m.terrain not in TERRAINS:
        errors.append("unknown terrain '%s' (use one of %s)" % (m.terrain, ", ".join(TERRAINS)))
    seen = set()
    cols, rows = grid_dims(m)
    walls = set()
    for o in m.objects:
        if o.type in ("wall", "building"):
            walls |= object_cells(o, cols, rows)
    for o in m.objects:
        if o.id in seen:
            errors.append("duplicate object id '%s'" % o.id)
        seen.add(o.id)
        if o.type not in OBJECT_TYPES:
            errors.append("%s: unknown objectType '%s'" % (o.id, o.type))
        if o.shape not in SHAPES:
            errors.append("%s: unknown shape '%s'" % (o.id, o.shape))
        if o.shape == "rect" and (o.size[0] <= 0 or o.size[1] <= 0):
            errors.append("%s: rect size must be positive" % o.id)
        if o.shape == "polygon" and len(o.points) < 3:
            errors.append("%s: polygon needs at least 3 points" % o.id)
        if "cover" in o.overrides and o.overrides["cover"] not in COVER_LEVELS:
            errors.append("%s: cover must be one of %s" % (o.id, ", ".join(COVER_LEVELS)))
        cells = object_cells(o, cols, rows)
        if not cells:
            errors.append("%s lies entirely outside the %dx%d ft map" % (o.id, int(m.width), int(m.height)))
        if o.type == "door" and cells and not (cells & walls):
            warnings.append("%s: door isn't set into a wall or building" % o.id)
    return errors, warnings
