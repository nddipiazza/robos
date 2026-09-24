# robos-crpg-blockout

Blockout maps for robos-crpg. A **blockout** (also called a greybox or whitebox) lays a level out with flat, labelled shapes, so it can be played and tested before any art exists. An artist can later paint over the same layout without changing any gameplay, because the rules read the collision grid, not the picture.

The input is KGraph data: a `robos:CRPGBattleMap` node whose `robos:mapObjects` are `robos:CRPGMapObject` nodes (walls, buildings, doors, trees, props). The output is:

- **A background image**, `games/crpg-realm/assets/blockouts/<slug>.png`, drawn at 16 px per foot by default. The scenario arena shows it behind every scene.
- **A 5-ft collision grid**, written back into the map node as `robos:blockout`. It lists blocked, opaque (sight-blocking), difficult-terrain and cover cells, and the scenario engine uses it for pathfinding, line of sight, cover and area spells.

## Usage

```bash
cd packages/robos-crpg-blockout

# Check a map's objects, shapes and bounds
python3 -m robos_crpg_blockout validate ../../games/crpg-realm/maps/*.jsonld

# Render the image and write the collision grid into each map
python3 -m robos_crpg_blockout build ../../games/crpg-realm/maps/*.jsonld

# Outline blocked and difficult cells in the image while laying a map out
python3 -m robos_crpg_blockout build ../../games/crpg-realm/maps/my-map.jsonld --debug-collision

# In CI: fail if any map's objects changed since its grid was built
python3 -m robos_crpg_blockout check ../../games/crpg-realm/maps/*.jsonld

# Render an image only, writing nothing back
python3 -m robos_crpg_blockout render ../../games/crpg-realm/maps/my-map.jsonld -o /tmp/preview.png
```

Run the tests with `python3 -m unittest discover -s tests`. The only dependency is Pillow.

## Writing a map

As KGraph JSON-LD, in `games/crpg-realm/maps/<slug>.jsonld`:

```json
{
  "@context": {"robos": "https://robos.dev/ns/sdlc#", "dcterms": "http://purl.org/dc/terms/"},
  "@id": "urn:robos:crpg:battle-map:village-square",
  "@type": ["robos:CRPGBattleMap", "schema:Place"],
  "dcterms:title": "Oakhaven village square",
  "robos:width": 120,
  "robos:height": 80,
  "robos:terrain": "grass",
  "robos:mapObjects": [
    {"@type": "robos:CRPGMapObject", "robos:objectId": "smithy", "robos:objectType": "building",
     "robos:shape": "rect", "robos:position": [10, 10], "robos:size": [30, 20], "dcterms:title": "Brand's Smithy"},
    {"@type": "robos:CRPGMapObject", "robos:objectId": "smithy_door", "robos:objectType": "door",
     "robos:shape": "rect", "robos:position": [20, 25], "robos:size": [5, 5], "robos:open": true},
    {"@type": "robos:CRPGMapObject", "robos:objectId": "town_wall", "robos:objectType": "wall",
     "robos:shape": "line", "robos:position": [0, 75], "robos:to": [120, 75]},
    {"@type": "robos:CRPGMapObject", "robos:objectId": "oak", "robos:objectType": "tree",
     "robos:shape": "circle", "robos:position": [70, 20], "robos:radius": 5}
  ]
}
```

Or in Python:

```python
from robos_crpg_blockout import MapBuilder

(MapBuilder("village-square", "Oakhaven village square", 120, 80, terrain="grass")
    .building("smithy", 10, 10, 30, 20, label="Brand's Smithy")
    .door("smithy_door", 20, 25, open=True)
    .wall("town_wall", (0, 75), (120, 75))
    .tree("oak", 70, 20, radius=5)
    .save("../../games/crpg-realm/maps/village-square.jsonld"))
```

A scenario uses a map by reference: `"robos:map": {"@id": "urn:robos:crpg:battle-map:village-square"}`. The engine loads `maps/village-square.jsonld`. It rejects a map that has objects but no built grid, and a creature that starts inside an obstacle.

## Coordinates

All measurements are in feet. Cell `(c, r)` covers `[5c, 5c+5) × [5r, 5r+5)`, and a creature at `(x, y)` stands in cell `(floor(x/5), floor(y/5))`. Shapes:

| Shape | Fields | Occupies |
|---|---|---|
| `rect` | `position` (top-left), `size` | Every cell it overlaps |
| `circle` | `position` (centre), `radius` | Cells whose centre is inside, plus the centre's cell |
| `line` | `position`, `to`, `thickness` (default 5) | Cells the line passes through, widened past 5 ft of thickness |
| `polygon` | `points` | Cells whose centre is inside |

Line walls are drawn from the exact cells they block, so the picture always matches the rules.

## Object types

| Type | Blocks movement | Blocks sight | Difficult | Cover |
|---|---|---|---|---|
| `wall`, `building`, `pillar` | yes | yes | | |
| `door` | yes when closed | yes when closed | | |
| `tree`, `rock`, `crate`, `barrel`, `table`, `altar`, `bed`, `chest`, `fence` | yes | | | half |
| `statue` | yes | | | three-quarters |
| `pit` | yes | | | |
| `water`, `rubble`, `stairs` | | | yes | |
| `bush` | | | yes | half |
| `road`, `bridge`, `rug`, `zone` | (decoration and labelled areas only) | | | |

Override any default on an object with `robos:blocksMovement`, `robos:blocksSight`, `robos:difficultTerrain` or `robos:cover`. Doors are applied last: an open door carves a passage through the wall under it, and a closed door seals it.

## How the engine uses the grid

- **Movement:** creatures move over the grid with 8-way steps, without cutting a wall's corner. Difficult cells cost 10 ft, and hostile creatures can't be walked through. A move to a blocked cell stops at the nearest free cell. The engine's audit checks every step of every path.
- **Line of sight:** an opaque cell between two creatures blocks weapon attacks and spells (`no_line_of_sight`). An area spell only hits creatures its origin can see, so a fireball doesn't go through walls.
- **Cover:** a cover cell between attacker and target adds +2 AC (half) or +5 AC (three-quarters).
