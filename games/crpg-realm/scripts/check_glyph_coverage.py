#!/usr/bin/env python3
"""
check_glyph_coverage.py — guard against "tofu" (the little domino/hex boxes Godot draws
for characters that no font can render).

Scans every GDScript, scene, data file and E2E step definition for non-ASCII characters
and verifies each one is covered by the project's UI font chain
(assets/fonts/ui_font_with_emoji.tres):

    OpenSans-SemiBold.ttf  ->  NotoEmoji-Medium.ttf  ->  DejaVuSans.ttf

Usage:
    python3 scripts/check_glyph_coverage.py          # report, exit 1 if anything is missing
    pip install fonttools                            # one-time dependency
"""

from __future__ import annotations

import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
FONTS = [
    PROJECT / "assets/fonts/OpenSans-SemiBold.ttf",
    PROJECT / "assets/fonts/NotoEmoji-Medium.ttf",
    PROJECT / "assets/fonts/DejaVuSans.ttf",
]
SCAN_GLOBS = ["scripts/**/*.gd", "scenes/**/*.tscn", "data/**/*.json", "data/**/*.yaml",
              "mods/**/*.gd", "mods/**/*.json", "src/**/*.gd", "tests/e2e/**/*.py"]
# Zero-width joiners / variation selectors are shaping controls, not visible glyphs.
IGNORED = {0x200D, 0xFE0E, 0xFE0F, 0x20E3}


def main() -> int:
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        print("fontTools not installed: pip install fonttools")
        return 2

    covered: set[int] = set()
    for f in FONTS:
        if not f.exists():
            print(f"missing font: {f}")
            return 2
        covered |= set(TTFont(str(f)).getBestCmap().keys())

    missing: dict[str, list[str]] = defaultdict(list)
    for pattern in SCAN_GLOBS:
        for path in PROJECT.glob(pattern):
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            for lineno, line in enumerate(text.splitlines(), 1):
                for ch in line:
                    cp = ord(ch)
                    if cp < 0x80 or cp in IGNORED or cp in covered:
                        continue
                    missing[ch].append(f"{path.relative_to(PROJECT)}:{lineno}")

    if not missing:
        print(f"OK - every character is covered by the UI font chain ({len(covered)} glyphs).")
        return 0

    print("Characters that will render as tofu boxes:")
    for ch, where in sorted(missing.items(), key=lambda kv: -len(kv[1])):
        name = unicodedata.name(ch, "?")
        print(f"  U+{ord(ch):04X} {ch!r} {name}  ({len(where)}x) e.g. {where[0]}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
