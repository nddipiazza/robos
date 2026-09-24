"""robos-crpg-blockout: blockout (greybox) maps for robos-crpg.

Turns robos:CRPGBattleMap KGraph nodes (walls, buildings, doors, trees, props)
into flat, labelled background images and the 5-ft collision grid the scenario
engine uses for movement, line of sight and cover. Art comes later; gameplay
reads the grid, never the picture.
"""

from .builder import BlockoutError, MapBuilder, build_map_file, is_stale
from .grid import compute_blockout, object_cells, validate
from .model import OBJECT_TYPES, BattleMap, MapObject, load_map
from .render import render

__all__ = ["BattleMap", "MapObject", "MapBuilder", "OBJECT_TYPES", "BlockoutError", "build_map_file",
           "compute_blockout", "is_stale", "load_map", "object_cells", "render", "validate"]
