"""Renders a blockout map to a PNG: flat, labelled shapes on a 5-ft grid.

The image is the static layer of a scene (floor, walls, buildings, props). It's
meant to be replaced by real art later without changing any gameplay, because
the rules read the collision grid, not the picture.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .grid import compute_blockout, grid_dims, object_cells
from .model import BattleMap, MapObject, GRID_FT

TERRAIN_COLORS = {
    "stone": (58, 62, 70), "grass": (62, 84, 56), "dirt": (88, 72, 56), "sand": (138, 122, 92),
    "wood": (92, 70, 50), "snow": (190, 196, 204), "cave": (40, 38, 42),
}
TYPE_STYLE = {
    # type: (fill, outline)
    "wall": ((34, 36, 42), (120, 126, 138)),
    "building": ((150, 152, 158), (60, 62, 70)),
    "door": ((128, 86, 48), (60, 38, 20)),
    "pillar": ((110, 112, 118), (60, 62, 70)),
    "tree": ((46, 110, 58), (26, 64, 34)),
    "rock": ((118, 116, 110), (70, 68, 64)),
    "statue": ((170, 168, 160), (90, 88, 84)),
    "crate": ((156, 116, 70), (92, 64, 34)),
    "barrel": ((140, 96, 58), (80, 52, 28)),
    "table": ((150, 110, 70), (86, 60, 34)),
    "altar": ((180, 176, 190), (96, 90, 110)),
    "bed": ((170, 150, 120), (100, 84, 60)),
    "chest": ((170, 130, 60), (100, 70, 26)),
    "fence": ((140, 104, 64), (80, 58, 30)),
    "pit": ((12, 10, 12), (170, 50, 50)),
    "water": ((52, 96, 150), (34, 66, 110)),
    "bush": ((84, 136, 70), (52, 90, 44)),
    "rubble": ((104, 98, 90), (70, 66, 60)),
    "stairs": ((128, 126, 122), (80, 78, 74)),
    "road": ((150, 132, 100), (120, 104, 76)),
    "bridge": ((132, 100, 66), (84, 60, 36)),
    "rug": ((130, 50, 60), (90, 30, 40)),
    "zone": ((0, 0, 0), (230, 200, 90)),
}
FONT_PATHS = [
    Path(__file__).resolve().parents[3] / "games" / "crpg-realm" / "assets" / "fonts" / "DejaVuSans.ttf",
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
]


def _font(size: int) -> ImageFont.ImageFont:
    for p in FONT_PATHS:
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def render(m: BattleMap, out_path: str | Path, px_per_ft: int = 16, show_grid: bool = True,
           show_labels: bool = True, debug_collision: bool = False) -> Path:
    s = px_per_ft
    w, h = int(round(m.width * s)), int(round(m.height * s))
    base = TERRAIN_COLORS.get(m.terrain, TERRAIN_COLORS["stone"])
    img = Image.new("RGBA", (w, h), base + (255,))

    # If background image is specified, composite it onto the base canvas
    if getattr(m, "background_image", None):
        bg_raw = str(m.background_image)
        bg_candidates = [
            Path(bg_raw),
            Path("games/crpg-realm") / bg_raw,
            Path("games/crpg-realm/assets/maps") / bg_raw,
            Path(__file__).resolve().parents[3] / "games" / "crpg-realm" / bg_raw,
            Path(__file__).resolve().parents[3] / "games" / "crpg-realm" / "assets" / "maps" / bg_raw,
            Path(out_path).parent / bg_raw,
        ]
        resolved = next((p for p in bg_candidates if p.exists() and p.is_file()), None)
        if resolved:
            try:
                bg_img = Image.open(resolved).convert("RGBA")
                if bg_img.size != (w, h):
                    bg_img = bg_img.resize((w, h), Image.Resampling.LANCZOS)
                opacity = float(getattr(m, "background_opacity", 1.0))
                if opacity < 1.0:
                    r, g, b, a = bg_img.split()
                    a = a.point(lambda p: int(p * opacity))
                    bg_img = Image.merge("RGBA", (r, g, b, a))
                img = Image.alpha_composite(img, bg_img)
            except Exception as e:
                print(f"Warning: could not load background image {resolved}: {e}")

    d = ImageDraw.Draw(img, "RGBA")
    cell = GRID_FT * s
    # Subtle per-cell floor variation so the grid reads at a glance (if no background or low opacity)
    if not getattr(m, "background_image", None) or getattr(m, "background_opacity", 1.0) < 0.8:
        overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d_overlay = ImageDraw.Draw(overlay, "RGBA")
        for c in range(int(m.width // GRID_FT) + 1):
            for r in range(int(m.height // GRID_FT) + 1):
                if (c + r) % 2 == 0:
                    d_overlay.rectangle([c * cell, r * cell, c * cell + cell - 1, r * cell + cell - 1], fill=(255, 255, 255, 8))
        img = Image.alpha_composite(img, overlay)
        d = ImageDraw.Draw(img, "RGBA")
    # Flat decor first (roads, rugs, water, zones), then solid objects, then doors on top
    order = {"road": 0, "rug": 0, "water": 0, "zone": 0, "bridge": 1, "rubble": 1, "stairs": 1, "bush": 2}
    objs = sorted(m.objects, key=lambda o: (3 if o.type == "door" else order.get(o.type, 2)))
    cols, rows = grid_dims(m)
    for o in objs:
        _draw_object(d, o, s, cols, rows)
    if show_grid:
        for c in range(0, w + 1, cell):
            d.line([(c, 0), (c, h)], fill=(255, 255, 255, 22), width=1)
        for r in range(0, h + 1, cell):
            d.line([(0, r), (w, r)], fill=(255, 255, 255, 22), width=1)
    if show_labels:
        f = _font(max(12, s))
        for o in objs:
            text = o.label or (o.type if o.type in ("building", "zone", "altar", "statue", "chest") else "")
            if text:
                cx, cy = _center(o, s)
                box = d.textbbox((0, 0), text, font=f)
                tw, th = box[2] - box[0], box[3] - box[1]
                d.rectangle([cx - tw / 2 - 6, cy - th / 2 - 4, cx + tw / 2 + 6, cy + th / 2 + 6], fill=(0, 0, 0, 120))
                d.text((cx - tw / 2, cy - th / 2), text, font=f, fill=(240, 240, 235))
    if debug_collision:
        grid = compute_blockout(m)
        for c, r in grid["blocked"]:
            d.rectangle([c * cell, r * cell, c * cell + cell, r * cell + cell], outline=(255, 60, 60, 200), width=2)
        for c, r in grid["difficult"]:
            d.rectangle([c * cell + 4, r * cell + 4, c * cell + cell - 4, r * cell + cell - 4], outline=(80, 160, 255, 200), width=2)
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.suffix.lower() in (".jpg", ".jpeg"):
        img.convert("RGB").save(out, quality=95)
    else:
        img.convert("RGB").save(out)
    return out


def _center(o: MapObject, s: int) -> tuple[float, float]:
    if o.shape == "rect":
        return (o.position[0] + o.size[0] / 2) * s, (o.position[1] + o.size[1] / 2) * s
    if o.shape == "line":
        return (o.position[0] + o.to[0]) / 2 * s, (o.position[1] + o.to[1]) / 2 * s
    if o.shape == "polygon" and o.points:
        return sum(p[0] for p in o.points) / len(o.points) * s, sum(p[1] for p in o.points) / len(o.points) * s
    return o.position[0] * s, o.position[1] * s


def _draw_object(d: ImageDraw.ImageDraw, o: MapObject, s: int, cols: int = 10 ** 6, rows: int = 10 ** 6) -> None:
    fill, outline = TYPE_STYLE.get(o.type, TYPE_STYLE["zone"])
    lw = max(2, s // 6)
    if o.type == "zone":
        fill_rgba = (0, 0, 0, 0)
    elif o.type == "door" and o.open:
        fill_rgba = fill + (90,)
    else:
        fill_rgba = fill + (255,)
    if o.shape == "rect":
        x0, y0 = o.position[0] * s, o.position[1] * s
        x1, y1 = x0 + o.size[0] * s, y0 + o.size[1] * s
        d.rectangle([x0, y0, x1, y1], fill=fill_rgba, outline=outline, width=lw)
        if o.type == "building":
            # A roof ridge line so buildings read as roofs from above
            if o.size[0] >= o.size[1]:
                d.line([(x0 + lw, (y0 + y1) / 2), (x1 - lw, (y0 + y1) / 2)], fill=outline, width=lw)
            else:
                d.line([((x0 + x1) / 2, y0 + lw), ((x0 + x1) / 2, y1 - lw)], fill=outline, width=lw)
        elif o.type in ("crate", "chest"):
            d.line([(x0, y0), (x1, y1)], fill=outline, width=lw)
            d.line([(x0, y1), (x1, y0)], fill=outline, width=lw)
        elif o.type == "stairs":
            step = max(4, int(s * 1.25))
            y = y0 + step
            while y < y1:
                d.line([(x0, y), (x1, y)], fill=outline, width=max(1, lw // 2))
                y += step
        elif o.type == "water":
            _waves(d, x0, y0, x1, y1, s)
        elif o.type == "zone":
            _dashed_rect(d, x0, y0, x1, y1, outline, lw)
    elif o.shape == "circle":
        cx, cy, r = o.position[0] * s, o.position[1] * s, o.radius * s
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill_rgba, outline=outline, width=lw)
        if o.type == "tree":
            d.ellipse([cx - r * 0.25, cy - r * 0.25, cx + r * 0.25, cy + r * 0.25], fill=(88, 64, 40), outline=outline)
        elif o.type == "barrel":
            d.ellipse([cx - r * 0.6, cy - r * 0.6, cx + r * 0.6, cy + r * 0.6], outline=outline, width=max(1, lw // 2))
    elif o.shape == "line":
        # Drawn from the exact cells it occupies, so the picture always matches the collision grid
        cell = GRID_FT * s
        cells = sorted(object_cells(o, cols, rows))
        for c, r in cells:
            x0, y0 = c * cell, r * cell
            if o.type == "fence":
                bar = max(lw, cell // 6)
                d.rectangle([x0, y0 + cell / 2 - bar / 2, x0 + cell, y0 + cell / 2 + bar / 2], fill=fill_rgba)
                d.rectangle([x0 + cell / 2 - bar, y0 + cell / 4, x0 + cell / 2 + bar, y0 + cell * 3 / 4], fill=outline)
            else:
                d.rectangle([x0, y0, x0 + cell, y0 + cell], fill=fill_rgba)
        if o.type == "wall" and cells:
            # Outline only the wall's outer edges
            cs = set(cells)
            for c, r in cells:
                x0, y0 = c * cell, r * cell
                if (c, r - 1) not in cs:
                    d.line([(x0, y0), (x0 + cell, y0)], fill=outline, width=lw)
                if (c, r + 1) not in cs:
                    d.line([(x0, y0 + cell), (x0 + cell, y0 + cell)], fill=outline, width=lw)
                if (c - 1, r) not in cs:
                    d.line([(x0, y0), (x0, y0 + cell)], fill=outline, width=lw)
                if (c + 1, r) not in cs:
                    d.line([(x0 + cell, y0), (x0 + cell, y0 + cell)], fill=outline, width=lw)
    elif o.shape == "polygon" and len(o.points) >= 3:
        pts = [(x * s, y * s) for x, y in o.points]
        d.polygon(pts, fill=fill_rgba, outline=outline, width=lw)
        if o.type == "water":
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            _waves(d, min(xs), min(ys), max(xs), max(ys), s)


def _waves(d, x0, y0, x1, y1, s):
    step = max(8, s * 3)
    y = y0 + step / 2
    while y < y1:
        x = x0 + s
        while x < x1 - s * 2:
            d.arc([x, y - s / 2, x + s * 2, y + s / 2], 200, 340, fill=(160, 200, 240, 150), width=max(1, s // 8))
            x += s * 3
        y += step


def _dashed_rect(d, x0, y0, x1, y1, color, lw):
    dash = 12
    for (ax, ay, bx, by) in ((x0, y0, x1, y0), (x1, y0, x1, y1), (x1, y1, x0, y1), (x0, y1, x0, y0)):
        length = math.hypot(bx - ax, by - ay)
        n = max(1, int(length // (dash * 2)))
        for i in range(n):
            t0, t1 = i * 2 * dash / length, min(1.0, (i * 2 + 1) * dash / length)
            d.line([(ax + (bx - ax) * t0, ay + (by - ay) * t0), (ax + (bx - ax) * t1, ay + (by - ay) * t1)], fill=color, width=lw)
