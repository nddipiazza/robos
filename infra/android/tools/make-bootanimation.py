#!/usr/bin/env python3
"""Builds the RobOS boot animation for the Moto G10's 720 x 1600 screen.

The logo is navy on white, which would vanish on the RobOS dark background, so its
darkness becomes a mask: the robot is drawn in RobOS cyan and the name in near white.

Usage: make-bootanimation.py LOGO.png OUTPUT.zip [PREVIEW.png]
"""
import io
import sys
import zipfile

from PIL import Image, ImageChops, ImageOps

WIDTH, HEIGHT = 720, 1600
FPS = 30
BACKGROUND = (13, 17, 23)
ROBOT = (0, 188, 212)
NAME = (230, 237, 243)
FADE_FRAMES = 30
PULSE_FRAMES = 60


def load_logo(path):
    source = Image.open(path).convert("RGBA")
    flat = Image.new("RGBA", source.size, "white")
    flat.alpha_composite(source)
    # Darkness of each pixel, with the off-white paper texture cut away.
    mask = ImageOps.invert(flat.convert("L")).point(lambda v: 0 if v < 40 else min(255, int((v - 40) * 1.5)))
    box = mask.getbbox()
    mask = mask.crop(box)
    # The name starts where a mostly empty band of rows separates it from the robot.
    columns, rows = mask.size
    row_ink = [mask.crop((0, y, columns, y + 1)).point(lambda v: 255 if v > 128 else 0).histogram()[255] for y in range(rows)]
    middle = range(rows // 2, rows * 3 // 4)
    split = min(middle, key=lambda y: row_ink[y])
    scale = WIDTH * 0.6 / columns
    size = (round(columns * scale), round(rows * scale))
    mask = mask.resize(size, Image.LANCZOS)
    return mask, round(split * scale)


def frame(mask, split, level):
    """The logo over the background, with level from 0 (hidden) to 1 (full)."""
    canvas = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    faded = mask.point(lambda v: round(v * level))
    colors = Image.new("RGB", mask.size, NAME)
    colors.paste(ROBOT, (0, 0, mask.width, split))
    canvas.paste(colors, ((WIDTH - mask.width) // 2, (HEIGHT - mask.height) // 2), faded)
    return canvas


def add_png(archive, name, image):
    data = io.BytesIO()
    # Eight bits per pixel keeps a phone with 4 GB of memory from struggling during boot.
    image.convert("P", palette=Image.ADAPTIVE, colors=128).save(data, "PNG", optimize=True)
    # Android reads frames directly out of the zip, so they must be stored, not compressed.
    archive.writestr(zipfile.ZipInfo(name), data.getvalue(), zipfile.ZIP_STORED)


def main():
    logo, output = sys.argv[1], sys.argv[2]
    mask, split = load_logo(logo)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_STORED) as archive:
        # Fade in once, then pulse gently until Android has started.
        desc = f"{WIDTH} {HEIGHT} {FPS}\nc 1 0 part0\nc 0 0 part1\n"
        archive.writestr(zipfile.ZipInfo("desc.txt"), desc, zipfile.ZIP_STORED)
        for i in range(FADE_FRAMES):
            add_png(archive, f"part0/{i:03d}.png", frame(mask, split, (i + 1) / FADE_FRAMES))
        for i in range(PULSE_FRAMES):
            distance = abs(i - PULSE_FRAMES / 2) / (PULSE_FRAMES / 2)
            add_png(archive, f"part1/{i:03d}.png", frame(mask, split, 0.65 + 0.35 * distance))
    if len(sys.argv) > 3:
        frame(mask, split, 1).save(sys.argv[3])


if __name__ == "__main__":
    main()
