---
title: "cRPG Blockout"
package: robos-crpg-blockout
category: games
icon: robos-crpg-blockout.svg
summary: "A Python command-line tool that turns a robos:CRPGBattleMap node into a flat greybox PNG and the 5-ft collision grid the cRPG scenario engine plays on."
description: "robos-crpg-blockout reads a battle map's robos:mapObjects (walls, buildings, doors, trees, props), renders them as flat shapes, and writes blocked, sight-blocking, difficult-terrain and cover cells back into the map file as robos:blockout."
related:
  - /apps/crpg-editor/
  - /projects/crpg-realm/
  - /schemas/testing/crpg-battle-map.html
---

`packages/robos-crpg-blockout` builds blockout (greybox) maps for the cRPG in `games/crpg-realm` ([Realm of Heroes]({{ '/projects/crpg-realm/' | relative_url }})). The input is a `robos:CRPGBattleMap` JSON-LD node whose `robos:mapObjects` are `robos:CRPGMapObject` nodes. The output is a background PNG and a collision grid. The scenario engine (`scripts/engine/ScenarioEngine.gd`) reads only the grid for movement, line of sight and cover, so the picture can later be replaced by real art without changing gameplay. It has no window; the [cRPG Editor]({{ '/apps/crpg-editor/' | relative_url }}) runs its `build` command from the Maps tab.

## Install and run

It needs Python 3.10 or later and Pillow 10 or later, its only dependency. Run it as a module from the package folder, or `pip install` the folder to get a `robos-crpg-blockout` console script.

```bash
cd packages/robos-crpg-blockout
python3 -m robos_crpg_blockout validate ../../games/crpg-realm/maps/*.jsonld
python3 -m robos_crpg_blockout build ../../games/crpg-realm/maps/homestead-yard.jsonld
python3 -m robos_crpg_blockout check ../../games/crpg-realm/maps/*.jsonld
python3 -m robos_crpg_blockout render ../../games/crpg-realm/maps/homestead-yard.jsonld -o /tmp/preview.png
```

| Command | What it does |
|---|---|
| `validate <map>...` | Prints errors (unknown terrain, object type or shape, duplicate ids, empty rects, polygons with fewer than three points, objects entirely off the map) and warnings (a door that is not set into a wall or building). Exits 1 if any map has errors. |
| `build <map>...` | Validates, renders `<game-dir>/assets/blockouts/<slug>.png`, and rewrites the map file with `robos:blockout` and `robos:backgroundImage` set to `res://assets/blockouts/<slug>.png`. Flags: `--game-dir` (default `games/crpg-realm`, found relative to the package source), `--px-per-ft` (default 16), `--labels` (draw text labels, off by default) and `--debug-collision`. |
| `check <map>...` | Exits 1 if any map's objects have changed since its grid was built. Meant for CI. |
| `render <map> -o <file>` | Renders an image only and writes nothing back. Takes `--px-per-ft` and `--debug-collision`. |

The `<slug>` is the last `:` segment of the map's `@id`, lower-cased. A map file can be a bare battle map node, a scenario with the map inline under `robos:map`, or a KGraph package whose `@graph` contains one.

## The collision grid

The grid uses 5-ft cells. Cell `(c, r)` covers feet `[5c, 5c+5) × [5r, 5r+5)`, and it includes one extra column and row so an object at `x == width` is still on the map. `robos:blockout` holds `gridSize`, `cols`, `rows`, cell lists for `blocked`, `opaque` and `difficult` (difficult cells that are also blocked are dropped), `cover.half` and `cover.three-quarters`, the image path and `imagePxPerFoot`, and an `objectsHash` that `check` compares against the current objects.

| Shape | Fields | Cells it occupies |
|---|---|---|
| `rect` | `robos:position` (top-left), `robos:size` | Every cell it overlaps |
| `circle` | `robos:position` (centre), `robos:radius` | Cells whose centre is inside, plus the centre's cell |
| `line` | `robos:position`, `robos:to`, `robos:thickness` (default 5) | Cells the line passes through, widened when thicker than 5 ft |
| `polygon` | `robos:points` | Cells whose centre is inside |

Each `robos:objectType` has default rules in `OBJECT_TYPES` in `model.py`. `wall`, `building` and `pillar` block movement and sight; a `door` does too unless `robos:open` is true. `tree`, `rock`, `crate`, `barrel`, `table`, `altar`, `bed`, `chest` and `fence` block movement and give half cover, `statue` gives three-quarters cover, and `pit` only blocks movement. `water`, `rubble` and `stairs` are difficult terrain, and `bush` is difficult with half cover. `road`, `bridge`, `rug`, `zone`, `passage`, `dais`, `item`, `pickup` and `weapon` have no effect on the grid. Any object can override its defaults with `robos:blocksMovement`, `robos:blocksSight`, `robos:difficultTerrain` or `robos:cover`. Doors are applied last, so an open door clears the wall cells under it and a closed door seals them.

The image is drawn from the same object list at `--px-per-ft` pixels per foot over a terrain colour (`stone`, `grass`, `dirt`, `sand`, `wood`, `snow` or `cave`), with flat decor first, solid objects next and doors on top. `--debug-collision` outlines blocked cells in red and difficult cells in blue.

## Writing maps in Python

`MapBuilder` writes the same JSON-LD from code. Its helpers are `rect`, `circle`, `wall`, `fence`, `building`, `door`, `tree`, `rock` and `polygon`.

```python
from robos_crpg_blockout import MapBuilder

(MapBuilder("village-square", "Oakhaven village square", 120, 80, terrain="grass")
    .building("smithy", 10, 10, 30, 20, label="Brand's Smithy")
    .door("smithy_door", 20, 25, open=True)
    .wall("town_wall", (0, 75), (120, 75))
    .tree("oak", 70, 20, radius=5)
    .save("../../games/crpg-realm/maps/village-square.jsonld"))
```

A scenario refers to a map with `"robos:map": {"@id": "urn:robos:crpg:battle-map:village-square"}`. The engine refuses a map that has objects but no `robos:blockout`, and a creature that starts in a blocked cell. The Gherkin scenarios in `games/crpg-realm/tests/e2e/features/engine/11_blockout_maps.feature` exercise walls, doors, line of sight, cover and difficult terrain in the engine.

## Limitations

- `render` always draws labels, and when labels are drawn the `--debug-collision` outlines are lost: they are painted on the image before the label layer replaces it. Use `build --debug-collision` (labels are off by default there) to see the collision overlay.
- `build` replaces `robos:backgroundImage` with the blockout's own `res://` path, and the renderer does not resolve `res://` paths. A hand-set background image is therefore composited only on the first build; later builds draw the plain terrain colour.
- `robos:sprite` (or `robos:icon`) on an object is read and saved but not drawn.
- The default `--game-dir` is worked out from the package's location in the repository, so pass `--game-dir` when running an installed copy outside the checkout.

## Tests

The tests use `unittest` and Pillow, and write only to temporary directories.

```bash
cd packages/robos-crpg-blockout
python3 -m unittest discover -s tests
```

They cover the cells each shape occupies, the per-type rules and overrides, doors in walls, validation, image size and wall placement, `build` and `check`, JSON-LD round trips, finding a map inside a scenario or `@graph`, and the CLI exit codes.
