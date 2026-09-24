"""Tests for robos-crpg-blockout. Run: python3 -m unittest discover -s tests"""

import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from robos_crpg_blockout import (BattleMap, MapBuilder, MapObject, build_map_file, compute_blockout,
                                 is_stale, load_map, object_cells, render, validate)
from robos_crpg_blockout.cli import main as cli_main
from robos_crpg_blockout.render import TERRAIN_COLORS, TYPE_STYLE


def cells(grid, key):
    return {tuple(c) for c in grid[key]}


class GridTests(unittest.TestCase):
    def test_line_wall_occupies_the_cells_it_passes_through(self):
        o = MapObject(id="w", type="wall", shape="line", position=(20, 0), to=(20, 20))
        self.assertEqual(object_cells(o, 10, 10), {(4, r) for r in range(5)})

    def test_rect_covers_every_cell_it_overlaps(self):
        o = MapObject(id="t", type="table", shape="rect", position=(45, 30), size=(15, 10))
        self.assertEqual(object_cells(o, 30, 30), {(c, r) for c in (9, 10, 11) for r in (6, 7)})

    def test_circle_covers_cells_whose_centres_are_inside(self):
        o = MapObject(id="oak", type="tree", shape="circle", position=(50, 10), radius=5)
        self.assertEqual(object_cells(o, 30, 30), {(9, 1), (10, 1), (9, 2), (10, 2)})

    def test_polygon_covers_cells_whose_centres_are_inside(self):
        o = MapObject(id="pond", type="water", shape="polygon", points=[(0, 0), (10, 0), (10, 10), (0, 10)])
        self.assertEqual(object_cells(o, 10, 10), {(0, 0), (1, 0), (0, 1), (1, 1)})

    def test_cells_outside_the_map_are_dropped(self):
        o = MapObject(id="w", type="wall", shape="line", position=(0, 0), to=(200, 0))
        self.assertEqual(len(object_cells(o, 5, 5)), 5)

    def test_object_types_have_movement_sight_and_cover_rules(self):
        m = (MapBuilder("t", "t", 60, 40)
             .wall("wall", (0, 0), (0, 10)).tree("tree", 20, 20, radius=2)
             .rect("pond", "water", 40, 0, 5, 5).rect("crate", "crate", 50, 30, 5, 5).build())
        g = compute_blockout(m)
        self.assertIn((0, 0), cells(g, "blocked"))
        self.assertIn((0, 0), cells(g, "opaque"))
        self.assertIn((4, 4), cells(g, "blocked"))
        self.assertNotIn((4, 4), cells(g, "opaque"))
        self.assertIn((4, 4), {tuple(c) for c in g["cover"]["half"]})
        self.assertIn((8, 0), cells(g, "difficult"))
        self.assertNotIn((8, 0), cells(g, "blocked"))
        self.assertIn((10, 6), {tuple(c) for c in g["cover"]["half"]})

    def test_open_door_carves_a_passage_through_a_wall_and_closed_door_seals_it(self):
        base = MapBuilder("d", "d", 40, 40).wall("wall", (20, 0), (20, 30))
        opened = compute_blockout(base.door("gate", 20, 10, open=True).build())
        self.assertNotIn((4, 2), cells(opened, "blocked"))
        self.assertNotIn((4, 2), cells(opened, "opaque"))
        self.assertIn((4, 1), cells(opened, "blocked"))
        closed = compute_blockout(MapBuilder("d", "d", 40, 40).wall("wall", (20, 0), (20, 30)).door("gate", 20, 10).build())
        self.assertIn((4, 2), cells(closed, "blocked"))

    def test_explicit_overrides_beat_type_defaults(self):
        m = MapBuilder("o", "o", 20, 20).rect("glass", "wall", 5, 5, 5, 5, blocksSight=False).build()
        g = compute_blockout(m)
        self.assertIn((1, 1), cells(g, "blocked"))
        self.assertNotIn((1, 1), cells(g, "opaque"))

    def test_grid_includes_the_far_edge_so_positions_at_width_are_on_the_map(self):
        g = compute_blockout(MapBuilder("e", "e", 50, 30).build())
        self.assertEqual((g["cols"], g["rows"]), (11, 7))


class ValidationTests(unittest.TestCase):
    def test_reports_unknown_types_shapes_duplicates_and_off_map_objects(self):
        m = BattleMap(id="urn:x", title="x", width=30, height=30, objects=[
            MapObject(id="a", type="volcano"),
            MapObject(id="a", type="wall", shape="blob"),
            MapObject(id="far", type="rock", shape="circle", position=(500, 500), radius=2),
        ])
        errors, _ = validate(m)
        text = " ".join(errors)
        self.assertIn("unknown objectType 'volcano'", text)
        self.assertIn("unknown shape 'blob'", text)
        self.assertIn("duplicate object id 'a'", text)
        self.assertIn("far lies entirely outside", text)

    def test_warns_about_a_door_that_isnt_in_a_wall(self):
        _, warnings = validate(MapBuilder("w", "w", 30, 30).door("lonely", 10, 10).build())
        self.assertTrue(any("lonely" in w for w in warnings))

    def test_rejects_unknown_terrain(self):
        errors, _ = validate(MapBuilder("t", "t", 30, 30, terrain="lava").build())
        self.assertTrue(any("terrain" in e for e in errors))


class RenderAndBuildTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_image_is_sized_by_pixels_per_foot_and_draws_walls_on_their_cells(self):
        m = MapBuilder("r", "r", 40, 20, terrain="grass").wall("w", (20, 0), (20, 20)).build()
        out = render(m, self.tmp / "r.png", px_per_ft=10, show_grid=False, show_labels=False)
        img = Image.open(out).convert("RGB")
        self.assertEqual(img.size, (400, 200))
        # Centre of wall cell (4, 1) is wall-coloured; far from it is grass
        self.assertEqual(img.getpixel((225, 75)), TYPE_STYLE["wall"][0])
        g = img.getpixel((50, 150))
        self.assertTrue(all(abs(a - b) <= 10 for a, b in zip(g, TERRAIN_COLORS["grass"])))

    def test_build_writes_the_image_and_collision_grid_into_the_kgraph_node(self):
        path = MapBuilder("yard", "Yard", 30, 30).building("hut", 0, 0, 10, 10, label="Hut").save(self.tmp / "maps" / "yard.jsonld")
        summary = build_map_file(path, self.tmp, px_per_ft=8)
        self.assertTrue((self.tmp / "assets" / "blockouts" / "yard.png").exists())
        node = json.loads(path.read_text())
        self.assertEqual(node["robos:backgroundImage"], "res://assets/blockouts/yard.png")
        self.assertEqual(node["robos:blockout"]["gridSize"], 5)
        self.assertEqual(summary["blocked"], 4)
        self.assertFalse(is_stale(path))

    def test_editing_objects_makes_the_grid_stale(self):
        path = MapBuilder("yard", "Yard", 30, 30).rock("stone", 10, 10).save(self.tmp / "yard.jsonld")
        build_map_file(path, self.tmp, px_per_ft=8)
        node = json.loads(path.read_text())
        node["robos:mapObjects"][0]["robos:position"] = [20, 20]
        path.write_text(json.dumps(node))
        self.assertTrue(is_stale(path))

    def test_map_round_trips_through_kgraph_json_ld(self):
        m = (MapBuilder("rt", "Round trip", 50, 40, terrain="dirt", map_zone="urn:robos:crpg:zone:x")
             .wall("w", (0, 0), (10, 0), thickness=5).door("d", 5, 0, open=True).tree("t", 30, 30).build())
        again = BattleMap.from_node(json.loads(json.dumps(m.to_node())))
        self.assertEqual(again.to_node(), m.to_node())
        self.assertEqual(again.slug, "rt")

    def test_load_map_finds_the_map_inside_a_scenario_or_kgraph_package(self):
        node = MapBuilder("pkg", "Pkg", 20, 20).build().to_node()
        (self.tmp / "pkg.jsonld").write_text(json.dumps({"@graph": [{"@id": "x", "@type": "robos:Other"}, node]}))
        self.assertEqual(load_map(self.tmp / "pkg.jsonld").title, "Pkg")

    def test_cli_validate_and_check_exit_codes(self):
        good = MapBuilder("good", "Good", 20, 20).rock("r", 10, 10).save(self.tmp / "good.jsonld")
        self.assertEqual(cli_main(["validate", str(good)]), 0)
        self.assertEqual(cli_main(["check", str(good)]), 1)
        self.assertEqual(cli_main(["build", str(good), "--game-dir", str(self.tmp), "--px-per-ft", "4"]), 0)
        self.assertEqual(cli_main(["check", str(good)]), 0)
        bad = self.tmp / "bad.jsonld"
        node = json.loads(good.read_text())
        node["robos:mapObjects"][0]["robos:objectType"] = "volcano"
        bad.write_text(json.dumps(node))
        self.assertEqual(cli_main(["validate", str(bad)]), 1)


if __name__ == "__main__":
    unittest.main()
