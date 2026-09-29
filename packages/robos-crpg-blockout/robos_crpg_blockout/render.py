"""Renders a blockout map to a PNG: flat, labelled shapes on a 5-ft grid.

The image is the static layer of a scene (floor, walls, buildings, props). It's
meant to be replaced by real art later without changing any gameplay, because
the rules read the collision grid, not the picture.
"""

from __future__ import annotations

import math
import re
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
    "passage": ((128, 86, 48), (60, 38, 20)),
    "dais": ((160, 156, 170), (96, 90, 110)),
    "item": ((240, 200, 60), (180, 140, 20)),
    "pickup": ((240, 200, 60), (180, 140, 20)),
    "weapon": ((240, 200, 60), (180, 140, 20)),
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
        img = _render_labels(img, objs, s, w, h)
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


def _clean_label(o: MapObject) -> str:
    text = (o.label or (o.type if o.type in ("building", "zone", "altar", "statue", "chest") else "")).strip()
    if not text:
        return ""
    # Condense verbose descriptions for clean tactical battlemap schematics
    text = re.sub(r"^Treasure Chest \((.*?)\)$", r"Chest: \1", text, flags=re.IGNORECASE)
    text = re.sub(r"^Treasure Chest$", r"Chest", text, flags=re.IGNORECASE)
    text = re.sub(r"^Stone Pillar [A-Za-z]+$", r"Pillar", text, flags=re.IGNORECASE)
    text = re.sub(r"^Stone Pillar$", r"Pillar", text, flags=re.IGNORECASE)
    text = re.sub(r"^Royal Locked Door$", r"Locked Door", text, flags=re.IGNORECASE)
    text = re.sub(r"^Stairs Down to (.*?)$", r"Stairs: \1", text, flags=re.IGNORECASE)
    text = re.sub(r"([0-9]+)\s*Gold\b", r"\1G", text, flags=re.IGNORECASE)
    text = re.sub(r"King Lorik's Throne Dais", "Throne Dais", text, flags=re.IGNORECASE)
    text = re.sub(r"King's Royal Throne", "Royal Throne", text, flags=re.IGNORECASE)
    # Don't label plain walls
    if o.type == "wall" and text.lower() in ("wall", "stone wall", "perimeter wall"):
        return ""
    return text


def _object_bounds(o: MapObject, s: int) -> tuple[float, float, float, float]:
    if o.shape == "rect":
        return o.position[0] * s, o.position[1] * s, (o.position[0] + o.size[0]) * s, (o.position[1] + o.size[1]) * s
    if o.shape == "circle":
        return (o.position[0] - o.radius) * s, (o.position[1] - o.radius) * s, (o.position[0] + o.radius) * s, (o.position[1] + o.radius) * s
    if o.shape == "line":
        x0, x1 = min(o.position[0], o.to[0]) * s, max(o.position[0], o.to[0]) * s
        y0, y1 = min(o.position[1], o.to[1]) * s, max(o.position[1], o.to[1]) * s
        return x0, y0, x1, y1
    if o.shape == "polygon" and o.points:
        xs = [p[0] * s for p in o.points]
        ys = [p[1] * s for p in o.points]
        return min(xs), min(ys), max(xs), max(ys)
    return o.position[0] * s, o.position[1] * s, o.position[0] * s, o.position[1] * s


def _boxes_intersect(b1: tuple[float, float, float, float], b2: tuple[float, float, float, float], pad: float = 2.0) -> bool:
    return not (b1[2] + pad < b2[0] - pad or b1[0] - pad > b2[2] + pad or
                b1[3] + pad < b2[1] - pad or b1[1] - pad > b2[3] + pad)


def _render_labels(img: Image.Image, objs: list[MapObject], s: int, map_w: int, map_h: int) -> Image.Image:
    # Use compact, crisp font size (clamped to 9-11px for clean technical schematics)
    font_size = max(9, min(11, int(s * 0.6)))
    f = _font(font_size)

    # Prepare candidate items: (object, cleaned_text, bounds, center)
    candidates = []
    for o in objs:
        clean = _clean_label(o)
        if clean:
            bx = _object_bounds(o, s)
            cx, cy = _center(o, s)
            candidates.append({
                "obj": o,
                "text": clean,
                "bounds": bx,
                "cx": cx,
                "cy": cy,
                "area": max(1.0, (bx[2] - bx[0]) * (bx[3] - bx[1])),
            })

    if not candidates:
        return img

    # Detect containment: if item A contains item B, place A's label at its top edge
    for i, c_a in enumerate(candidates):
        for j, c_b in enumerate(candidates):
            if i != j:
                b_a, b_b = c_a["bounds"], c_b["bounds"]
                if (b_a[0] <= b_b[0] + 1 and b_a[1] <= b_b[1] + 1 and
                        b_a[2] >= b_b[2] - 1 and b_a[3] >= b_b[3] - 1 and c_a["area"] > c_b["area"]):
                    # c_a contains c_b -> anchor c_a to top edge
                    c_a["anchor_top"] = True

    # Sort candidates so smaller/inner props are placed first, containers second
    candidates.sort(key=lambda c: (1 if c.get("anchor_top") else 0, -c["area"] if not c.get("anchor_top") else c["area"]))

    label_overlay = Image.new("RGBA", (map_w, map_h), (0, 0, 0, 0))
    d_lbl = ImageDraw.Draw(label_overlay, "RGBA")

    placed_boxes: list[tuple[float, float, float, float]] = []
    h_pad = 4.0
    v_pad = 2.0

    for cand in candidates:
        text = cand["text"]
        tbox = d_lbl.textbbox((0, 0), text, font=f)
        tw = tbox[2] - tbox[0]
        th = tbox[3] - tbox[1]

        # Determine preferred center
        bx = cand["bounds"]
        bw = bx[2] - bx[0]
        bh = bx[3] - bx[1]

        if cand.get("anchor_top"):
            # Top edge of container
            pref_cx = (bx[0] + bx[2]) / 2
            pref_cy = bx[1] + th / 2 + v_pad + 2
        elif cand["obj"].type in ("chest", "crate", "barrel") and bh <= 4 * s:
            # Place small prop label slightly below prop so icon/wood cross is visible
            pref_cx = cand["cx"]
            pref_cy = bx[3] + th / 2 + v_pad + 2
        else:
            pref_cx = cand["cx"]
            pref_cy = cand["cy"]

        # Clamp preferred center within map bounds
        pref_cx = max(tw / 2 + h_pad + 2, min(map_w - tw / 2 - h_pad - 2, pref_cx))
        pref_cy = max(th / 2 + v_pad + 2, min(map_h - th / 2 - v_pad - 2, pref_cy))

        # Collision avoidance candidates
        offsets = [
            (0, 0),
            (0, -(th + v_pad * 2 + 4)),
            (0, (th + v_pad * 2 + 4)),
            (-(tw / 2 + h_pad + 6), 0),
            ((tw / 2 + h_pad + 6), 0),
            (0, -(th + v_pad * 2 + 8)),
            (0, (th + v_pad * 2 + 8)),
        ]

        best_pos = None
        for ox, oy in offsets:
            test_cx = pref_cx + ox
            test_cy = pref_cy + oy
            test_box = (
                test_cx - tw / 2 - h_pad,
                test_cy - th / 2 - v_pad,
                test_cx + tw / 2 + h_pad,
                test_cy + th / 2 + v_pad,
            )
            # Must stay inside map
            if test_box[0] < 2 or test_box[1] < 2 or test_box[2] > map_w - 2 or test_box[3] > map_h - 2:
                continue
            # Must not intersect already placed labels
            if any(_boxes_intersect(test_box, pb) for pb in placed_boxes):
                continue
            best_pos = (test_cx, test_cy, test_box)
            break

        if not best_pos:
            # If it's a secondary prop (e.g. repetitive pillar or decorative chest) and would collide, skip it
            if cand["obj"].type in ("pillar", "fence", "rubble", "wall"):
                continue
            # Try a compact version of text if available
            compact_text = text.split(":")[-1].strip() if ":" in text else text[:10]
            tbox = d_lbl.textbbox((0, 0), compact_text, font=f)
            tw = tbox[2] - tbox[0]
            th = tbox[3] - tbox[1]
            for ox, oy in offsets:
                test_cx = pref_cx + ox
                test_cy = pref_cy + oy
                test_box = (
                    test_cx - tw / 2 - h_pad,
                    test_cy - th / 2 - v_pad,
                    test_cx + tw / 2 + h_pad,
                    test_cy + th / 2 + v_pad,
                )
                if test_box[0] < 2 or test_box[1] < 2 or test_box[2] > map_w - 2 or test_box[3] > map_h - 2:
                    continue
                if any(_boxes_intersect(test_box, pb) for pb in placed_boxes):
                    continue
                text = compact_text
                best_pos = (test_cx, test_cy, test_box)
                break

        if best_pos:
            final_cx, final_cy, final_box = best_pos
            placed_boxes.append(final_box)

            # Draw sleek semi-transparent pill badge
            d_lbl.rounded_rectangle(
                [final_box[0], final_box[1], final_box[2], final_box[3]],
                radius=3,
                fill=(16, 20, 28, 195),
                outline=(75, 90, 110, 180),
                width=1,
            )
            # Draw crisp text
            d_lbl.text(
                (final_cx - tw / 2, final_cy - th / 2 - 1),
                text,
                font=f,
                fill=(240, 243, 248, 255),
            )

    return Image.alpha_composite(img, label_overlay)


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
