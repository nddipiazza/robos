# UI fonts

`ui_font_with_emoji.tres` is the project-wide UI font (`gui/theme/custom_font`).
It layers glyph fallbacks so no label ever renders "tofu" boxes, independent of
which system fonts the player's machine has installed:

1. `OpenSans-SemiBold.ttf` — base Latin/Greek/Cyrillic text (matches Godot's built-in default look). OFL 1.1.
2. `NotoEmoji-Medium.ttf` — monochrome emoji (🕊 🛡 🔥 🧪 🔧 …), incl. U+FE0F variation selectors. OFL 1.1.
3. `DejaVuSans.ttf` — box drawing, arrows, stars, geometric shapes (─ ★ ▲ ● ➔ …). Bitstream Vera license.

Run `python3 scripts/check_glyph_coverage.py` after adding new symbols to strings.
