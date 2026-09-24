"""Command line: python3 -m robos_crpg_blockout <command> ...

  validate <map.jsonld>...          check objects, shapes and bounds
  build    <map.jsonld>...          render assets/blockouts/<slug>.png and write the collision grid into the map
  render   <map.jsonld> -o out.png  render an image only (nothing written back)
  check    <map.jsonld>...          exit 1 if any map's grid is out of date with its objects (for CI)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .builder import BlockoutError, build_map_file, is_stale
from .grid import validate
from .model import load_map
from .render import render

DEFAULT_GAME_DIR = Path(__file__).resolve().parents[3] / "games" / "crpg-realm"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="robos-crpg-blockout", description="Blockout (greybox) maps for robos-crpg")
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("validate")
    v.add_argument("maps", nargs="+")
    b = sub.add_parser("build")
    b.add_argument("maps", nargs="+")
    b.add_argument("--game-dir", default=str(DEFAULT_GAME_DIR))
    b.add_argument("--px-per-ft", type=int, default=16)
    b.add_argument("--debug-collision", action="store_true", help="outline blocked and difficult cells in the image")
    r = sub.add_parser("render")
    r.add_argument("map")
    r.add_argument("-o", "--out", required=True)
    r.add_argument("--px-per-ft", type=int, default=16)
    r.add_argument("--debug-collision", action="store_true")
    c = sub.add_parser("check")
    c.add_argument("maps", nargs="+")
    args = ap.parse_args(argv)

    if args.cmd == "validate":
        bad = 0
        for p in args.maps:
            errors, warnings = validate(load_map(p))
            for w in warnings:
                print(f"{p}: warning: {w}")
            for e in errors:
                print(f"{p}: error: {e}")
            bad += bool(errors)
            if not errors:
                print(f"{p}: ok")
        return 1 if bad else 0
    if args.cmd == "build":
        rc = 0
        for p in args.maps:
            try:
                s = build_map_file(p, args.game_dir, args.px_per_ft, args.debug_collision)
            except BlockoutError as e:
                print(f"{p}: error: {e}")
                rc = 1
                continue
            for w in s["warnings"]:
                print(f"{p}: warning: {w}")
            print(f"{p}: {s['image']} ({s['cols']}x{s['rows']} cells, {s['blocked']} blocked, "
                  f"{s['opaque']} opaque, {s['difficult']} difficult)")
        return rc
    if args.cmd == "render":
        out = render(load_map(args.map), args.out, args.px_per_ft, debug_collision=args.debug_collision)
        print(out)
        return 0
    if args.cmd == "check":
        stale = [p for p in args.maps if is_stale(p)]
        for p in stale:
            print(f"{p}: blockout is out of date; run: python3 -m robos_crpg_blockout build {p}")
        return 1 if stale else 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
