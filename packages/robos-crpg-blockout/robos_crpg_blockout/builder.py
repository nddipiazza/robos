"""Author blockout maps in code, and build them into images plus collision grids.

    from robos_crpg_blockout import MapBuilder
    (MapBuilder("village-square", "Oakhaven village square", 120, 80, terrain="grass")
        .building("smithy", 10, 10, 30, 20, label="Brand's Smithy")
        .door("smithy_door", 20, 25, 5, 5, open=True)
        .tree("oak", 70, 20, radius=5)
        .save("maps/village-square.jsonld"))
"""

from __future__ import annotations

import json
from pathlib import Path

from .grid import compute_blockout, validate
from .model import BattleMap, MapObject, find_map_node, load_map
from .render import render


class MapBuilder:
    def __init__(self, slug: str, title: str, width: float, height: float, terrain: str = "stone", map_zone: str = ""):
        self.map = BattleMap(id=f"urn:robos:crpg:battle-map:{slug}", title=title, width=width, height=height,
                             terrain=terrain, map_zone=map_zone)

    def add(self, obj: MapObject) -> "MapBuilder":
        self.map.objects.append(obj)
        return self

    def rect(self, id: str, type: str, x: float, y: float, w: float, h: float, label: str = "", **overrides) -> "MapBuilder":
        return self.add(MapObject(id=id, type=type, shape="rect", position=(x, y), size=(w, h), label=label, overrides=overrides))

    def circle(self, id: str, type: str, x: float, y: float, radius: float, label: str = "", **overrides) -> "MapBuilder":
        return self.add(MapObject(id=id, type=type, shape="circle", position=(x, y), radius=radius, label=label, overrides=overrides))

    def wall(self, id: str, start: tuple, end: tuple, thickness: float = 5, **overrides) -> "MapBuilder":
        return self.add(MapObject(id=id, type="wall", shape="line", position=tuple(start), to=tuple(end), thickness=thickness, overrides=overrides))

    def fence(self, id: str, start: tuple, end: tuple, **overrides) -> "MapBuilder":
        return self.add(MapObject(id=id, type="fence", shape="line", position=tuple(start), to=tuple(end), thickness=5, overrides=overrides))

    def building(self, id: str, x: float, y: float, w: float, h: float, label: str = "") -> "MapBuilder":
        return self.rect(id, "building", x, y, w, h, label=label)

    def door(self, id: str, x: float, y: float, w: float = 5, h: float = 5, open: bool = False) -> "MapBuilder":
        return self.add(MapObject(id=id, type="door", shape="rect", position=(x, y), size=(w, h), open=open))

    def tree(self, id: str, x: float, y: float, radius: float = 5) -> "MapBuilder":
        return self.circle(id, "tree", x, y, radius)

    def rock(self, id: str, x: float, y: float, radius: float = 3) -> "MapBuilder":
        return self.circle(id, "rock", x, y, radius)

    def polygon(self, id: str, type: str, points: list, label: str = "", **overrides) -> "MapBuilder":
        return self.add(MapObject(id=id, type=type, shape="polygon", points=[tuple(p) for p in points], label=label, overrides=overrides))

    def build(self) -> BattleMap:
        return self.map

    def save(self, path: str | Path) -> Path:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(self.map.to_node(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return p


class BlockoutError(ValueError):
    pass


def build_map_file(path: str | Path, game_dir: str | Path, px_per_ft: int = 16, debug_collision: bool = False) -> dict:
    """Validates a map file, renders its blockout image into
    <game_dir>/assets/blockouts/<slug>.png, and writes the collision grid and the
    image path back into the map node. Returns a summary."""
    path = Path(path)
    doc = json.loads(path.read_text(encoding="utf-8"))
    node = find_map_node(doc)
    m = BattleMap.from_node(node)
    errors, warnings = validate(m)
    if errors:
        raise BlockoutError("; ".join(errors))
    grid = compute_blockout(m)
    image_rel = f"assets/blockouts/{m.slug}.png"
    render(m, Path(game_dir) / image_rel, px_per_ft=px_per_ft, debug_collision=debug_collision)
    grid["image"] = "res://" + image_rel
    grid["imagePxPerFoot"] = px_per_ft
    node["robos:blockout"] = grid
    node["robos:backgroundImage"] = "res://" + image_rel
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"map": m.id, "file": str(path), "image": image_rel, "cols": grid["cols"], "rows": grid["rows"],
            "blocked": len(grid["blocked"]), "opaque": len(grid["opaque"]), "difficult": len(grid["difficult"]),
            "warnings": warnings}


def is_stale(path: str | Path) -> bool:
    """True when the map's objects changed since its blockout grid was built."""
    m = load_map(path)
    from .grid import objects_hash
    return (m.blockout or {}).get("objectsHash") != objects_hash(m)
