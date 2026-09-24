"""Blockout map model: robos:CRPGBattleMap and robos:CRPGMapObject KGraph nodes.

A blockout (also called a greybox or whitebox) lays a level out with flat,
labelled shapes so it can be played and tested before any art exists. Each
object type has default rules for movement, sight and cover; any object can
override them.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

GRID_FT = 5
CONTEXT = {
    "robos": "https://robos.dev/ns/sdlc#",
    "dcterms": "http://purl.org/dc/terms/",
    "schema": "https://schema.org/",
}

# objectType -> default rules. blocksMovement / blocksSight are booleans,
# difficult means double movement cost, cover is none | half | three-quarters.
OBJECT_TYPES: dict[str, dict] = {
    "wall":     {"blocksMovement": True,  "blocksSight": True,  "difficult": False, "cover": "none"},
    "building": {"blocksMovement": True,  "blocksSight": True,  "difficult": False, "cover": "none"},
    "door":     {"blocksMovement": True,  "blocksSight": True,  "difficult": False, "cover": "none"},
    "pillar":   {"blocksMovement": True,  "blocksSight": True,  "difficult": False, "cover": "none"},
    "tree":     {"blocksMovement": True,  "blocksSight": False, "difficult": False, "cover": "half"},
    "rock":     {"blocksMovement": True,  "blocksSight": False, "difficult": False, "cover": "half"},
    "statue":   {"blocksMovement": True,  "blocksSight": False, "difficult": False, "cover": "three-quarters"},
    "crate":    {"blocksMovement": True,  "blocksSight": False, "difficult": False, "cover": "half"},
    "barrel":   {"blocksMovement": True,  "blocksSight": False, "difficult": False, "cover": "half"},
    "table":    {"blocksMovement": True,  "blocksSight": False, "difficult": False, "cover": "half"},
    "altar":    {"blocksMovement": True,  "blocksSight": False, "difficult": False, "cover": "half"},
    "bed":      {"blocksMovement": True,  "blocksSight": False, "difficult": False, "cover": "half"},
    "chest":    {"blocksMovement": True,  "blocksSight": False, "difficult": False, "cover": "half"},
    "fence":    {"blocksMovement": True,  "blocksSight": False, "difficult": False, "cover": "half"},
    "pit":      {"blocksMovement": True,  "blocksSight": False, "difficult": False, "cover": "none"},
    "water":    {"blocksMovement": False, "blocksSight": False, "difficult": True,  "cover": "none"},
    "bush":     {"blocksMovement": False, "blocksSight": False, "difficult": True,  "cover": "half"},
    "rubble":   {"blocksMovement": False, "blocksSight": False, "difficult": True,  "cover": "none"},
    "stairs":   {"blocksMovement": False, "blocksSight": False, "difficult": True,  "cover": "none"},
    "road":     {"blocksMovement": False, "blocksSight": False, "difficult": False, "cover": "none"},
    "bridge":   {"blocksMovement": False, "blocksSight": False, "difficult": False, "cover": "none"},
    "rug":      {"blocksMovement": False, "blocksSight": False, "difficult": False, "cover": "none"},
    "zone":     {"blocksMovement": False, "blocksSight": False, "difficult": False, "cover": "none"},
}
SHAPES = ("rect", "circle", "line", "polygon")
TERRAINS = ("stone", "grass", "dirt", "sand", "wood", "snow", "cave")
COVER_LEVELS = ("none", "half", "three-quarters")


def _strip(key: str) -> str:
    return key.split(":", 1)[1] if ":" in key and not key.startswith("@") else key


def normalize(value):
    """Strips namespace prefixes (robos:, dcterms:, schema:) recursively."""
    if isinstance(value, list):
        return [normalize(v) for v in value]
    if isinstance(value, dict):
        return {(_strip(k) if not k.startswith("@") else k): normalize(v) for k, v in value.items()}
    return value


@dataclass
class MapObject:
    id: str
    type: str
    shape: str = "rect"
    position: tuple[float, float] = (0.0, 0.0)  # rect: top-left; circle: centre; line: start
    size: tuple[float, float] = (5.0, 5.0)      # rect only
    radius: float = 2.5                          # circle only
    to: tuple[float, float] = (0.0, 0.0)         # line only
    thickness: float = 5.0                       # line only
    points: list[tuple[float, float]] = field(default_factory=list)  # polygon only
    label: str = ""
    open: bool = False                           # doors only
    sprite: str = ""                             # optional sprite or icon image path
    overrides: dict = field(default_factory=dict)

    def rules(self) -> dict:
        r = dict(OBJECT_TYPES.get(self.type, OBJECT_TYPES["zone"]))
        if self.type == "door" and self.open:
            r["blocksMovement"] = False
            r["blocksSight"] = False
        r.update(self.overrides)
        return r

    @classmethod
    def from_node(cls, node: dict, index: int = 0) -> "MapObject":
        n = normalize(node)
        overrides = {k: n[k] for k in ("blocksMovement", "blocksSight", "difficult", "cover") if k in n}
        if "difficultTerrain" in n:
            overrides["difficult"] = bool(n["difficultTerrain"])
        pos = n.get("position", [0, 0])
        size = n.get("size", [5, 5])
        to = n.get("to", [0, 0])
        return cls(
            id=str(n.get("objectId", n.get("id", f"object_{index + 1}"))),
            type=str(n.get("objectType", n.get("type", "zone"))),
            shape=str(n.get("shape", "rect")),
            position=(float(pos[0]), float(pos[1])),
            size=(float(size[0]), float(size[1])),
            radius=float(n.get("radius", 2.5)),
            to=(float(to[0]), float(to[1])),
            thickness=float(n.get("thickness", 5)),
            points=[(float(p[0]), float(p[1])) for p in n.get("points", [])],
            label=str(n.get("title", n.get("label", ""))),
            open=bool(n.get("open", False)),
            sprite=str(n.get("sprite", n.get("icon", ""))),
            overrides=overrides,
        )

    def to_node(self) -> dict:
        node = {"@type": "robos:CRPGMapObject", "robos:objectId": self.id, "robos:objectType": self.type,
                "robos:shape": self.shape, "robos:position": list(self.position)}
        if self.shape == "rect":
            node["robos:size"] = list(self.size)
        elif self.shape == "circle":
            node["robos:radius"] = self.radius
        elif self.shape == "line":
            node["robos:to"] = list(self.to)
            node["robos:thickness"] = self.thickness
        elif self.shape == "polygon":
            node["robos:points"] = [list(p) for p in self.points]
        if self.label:
            node["dcterms:title"] = self.label
        if self.type == "door":
            node["robos:open"] = self.open
        if self.sprite:
            node["robos:sprite"] = self.sprite
        for k, v in self.overrides.items():
            node["robos:" + ("difficultTerrain" if k == "difficult" else k)] = v
        return node


@dataclass
class BattleMap:
    id: str
    title: str
    width: float
    height: float
    terrain: str = "stone"
    objects: list[MapObject] = field(default_factory=list)
    map_zone: str = ""
    blockout: dict = field(default_factory=dict)
    background_image: str = ""
    background_opacity: float = 1.0

    @property
    def slug(self) -> str:
        tail = self.id.rsplit(":", 1)[-1]
        return re.sub(r"[^a-z0-9-]+", "-", tail.lower()).strip("-") or "map"

    @classmethod
    def from_node(cls, node: dict) -> "BattleMap":
        n = normalize(node)
        objs = [MapObject.from_node(o, i) for i, o in enumerate(n.get("mapObjects", []))]
        zone = n.get("mapZone", "")
        if isinstance(zone, dict):
            zone = zone.get("@id", "")
        return cls(
            id=str(n.get("@id", "urn:robos:crpg:battle-map:map")),
            title=str(n.get("title", "Battle map")),
            width=float(n.get("width", 60)),
            height=float(n.get("height", 40)),
            terrain=str(n.get("terrain", "stone")),
            objects=objs,
            map_zone=str(zone),
            blockout=n.get("blockout", {}) or {},
            background_image=str(n.get("backgroundImage", "")),
            background_opacity=float(n.get("backgroundOpacity", 1.0)),
        )

    def to_node(self) -> dict:
        node = {
            "@context": CONTEXT,
            "@id": self.id,
            "@type": ["robos:CRPGBattleMap", "schema:Place"],
            "dcterms:title": self.title,
            "robos:width": self.width,
            "robos:height": self.height,
            "robos:terrain": self.terrain,
            "robos:mapObjects": [o.to_node() for o in self.objects],
        }
        if self.map_zone:
            node["robos:mapZone"] = {"@id": self.map_zone}
        if self.background_image:
            node["robos:backgroundImage"] = self.background_image
            if self.background_opacity != 1.0:
                node["robos:backgroundOpacity"] = self.background_opacity
        if self.blockout:
            node["robos:blockout"] = self.blockout
        return node


def load_map(path: str | Path) -> BattleMap:
    """Loads a map file: a robos:CRPGBattleMap node, a scenario with an inline map,
    or a KGraph package whose @graph contains a battle map."""
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    return BattleMap.from_node(find_map_node(doc))


def find_map_node(doc: dict) -> dict:
    def is_map(n):
        t = n.get("@type", [])
        return "CRPGBattleMap" in (" ".join(t) if isinstance(t, list) else str(t))
    if is_map(doc):
        return doc
    for key in ("robos:map", "map"):
        if isinstance(doc.get(key), dict) and ("robos:width" in doc[key] or "width" in doc[key]):
            return doc[key]
    for n in doc.get("@graph", []):
        if isinstance(n, dict) and is_map(n):
            return n
    raise ValueError("No robos:CRPGBattleMap node found")
