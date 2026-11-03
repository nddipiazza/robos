#!/usr/bin/env python3
"""Shrinks a generated image to game size and maps it onto the NES palette.

  nesify.py <in> <out> --width 256 --height 240 [--colors 16] [--key] [--crop] [--keep-colors]
  nesify.py <in> <out> --max 1024     convert to PNG for use as a reference

--key removes a sprite's solid background and makes it transparent.
"""
import argparse

from PIL import Image

# The NES 2C02 palette, without its duplicate blacks.
NES = [
    (0x7C, 0x7C, 0x7C), (0x00, 0x00, 0xFC), (0x00, 0x00, 0xBC), (0x44, 0x28, 0xBC), (0x94, 0x00, 0x84),
    (0xA8, 0x00, 0x20), (0xA8, 0x10, 0x00), (0x88, 0x14, 0x00), (0x50, 0x30, 0x00), (0x00, 0x78, 0x00),
    (0x00, 0x68, 0x00), (0x00, 0x58, 0x00), (0x00, 0x40, 0x58), (0x00, 0x00, 0x00), (0xBC, 0xBC, 0xBC),
    (0x00, 0x78, 0xF8), (0x00, 0x58, 0xF8), (0x68, 0x44, 0xFC), (0xD8, 0x00, 0xCC), (0xE4, 0x00, 0x58),
    (0xF8, 0x38, 0x00), (0xE4, 0x5C, 0x10), (0xAC, 0x7C, 0x00), (0x00, 0xB8, 0x00), (0x00, 0xA8, 0x00),
    (0x00, 0xA8, 0x44), (0x00, 0x88, 0x88), (0xF8, 0xF8, 0xF8), (0x3C, 0xBC, 0xFC), (0x68, 0x88, 0xFC),
    (0x98, 0x78, 0xF8), (0xF8, 0x78, 0xF8), (0xF8, 0x58, 0x98), (0xF8, 0x78, 0x58), (0xFC, 0xA0, 0x44),
    (0xF8, 0xB8, 0x00), (0xB8, 0xF8, 0x18), (0x58, 0xD8, 0x54), (0x58, 0xF8, 0x98), (0x00, 0xE8, 0xD8),
    (0x78, 0x78, 0x78), (0xA4, 0xE4, 0xFC), (0xB8, 0xB8, 0xF8), (0xD8, 0xB8, 0xF8), (0xF8, 0xB8, 0xF8),
    (0xF8, 0xA4, 0xC0), (0xF0, 0xD0, 0xB0), (0xFC, 0xE0, 0xA8), (0xF8, 0xD8, 0x78), (0xD8, 0xF8, 0x78),
    (0xB8, 0xF8, 0xB8), (0xB8, 0xF8, 0xD8), (0x00, 0xFC, 0xFC), (0xD8, 0xD8, 0xD8),
]


def center_crop(image, width, height):
    """Crops to the target's shape, so resizing does not squash the picture."""
    src_w, src_h = image.size
    target = width / height
    if src_w / src_h > target:
        new_w = round(src_h * target)
        left = (src_w - new_w) // 2
        return image.crop((left, 0, left + new_w, src_h))
    new_h = round(src_w / target)
    top = (src_h - new_h) // 2
    return image.crop((0, top, src_w, top + new_h))


def brighten(image):
    """Dark scenes would otherwise all land on the palette's few dark colors.

    One gain for all channels, so brown stays brown.
    """
    histogram = image.convert('L').histogram()
    total = sum(histogram)
    seen = 0
    level = 255
    for value, count in enumerate(histogram):
        seen += count
        if seen >= total * 0.99:
            level = max(value, 1)
            break
    gain = min(200 / level, 3.0)
    return image.point(lambda v: min(255, int(v * gain))) if gain > 1 else image


def to_lab(color):
    """sRGB to CIELAB, where straight-line distance matches how different colors look."""
    r, g, b = [(c / 255 / 12.92) if c / 255 <= 0.04045 else ((c / 255 + 0.055) / 1.055) ** 2.4 for c in color]
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    fx, fy, fz = [t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116 for t in (x, y, z)]
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


NES_LAB = [(to_lab(p), p) for p in NES]


def nearest_nes(color):
    lab = to_lab(color)
    return min(NES_LAB, key=lambda entry: sum((a - b) ** 2 for a, b in zip(entry[0], lab)))[1]


def nesify(image, width, height, colors, crop, keep_colors=False):
    source = image.convert('RGB')
    small = (center_crop(source, width, height) if crop else source).resize((width, height), Image.BOX)
    small = brighten(small)
    limited = small.quantize(colors=colors, dither=Image.Dither.NONE).convert('RGB')
    mapped = {color: color if keep_colors else nearest_nes(color) for _, color in limited.getcolors(width * height)}
    out = Image.new('RGBA', (width, height))
    for y in range(height):
        for x in range(width):
            out.putpixel((x, y), mapped[limited.getpixel((x, y))] + (255,))
    return out


def dominant_color(image):
    """The commonest color that is not near black, which a frame around the picture can be."""
    small = image.resize((128, 128), Image.NEAREST)
    counts = {}
    for y in range(128):
        for x in range(128):
            pixel = small.getpixel((x, y))
            if sum(pixel) >= 90:
                coarse = tuple(c // 24 for c in pixel)
                total, sums = counts.get(coarse, (0, (0, 0, 0)))
                counts[coarse] = (total + 1, tuple(a + b for a, b in zip(sums, pixel)))
    if not counts:
        return image.getpixel((0, 0))
    total, sums = max(counts.values(), key=lambda entry: entry[0])
    return tuple(c // total for c in sums)


def foreground_mask(image, background):
    """Pixels of the subject: not background, in a group that does not touch the image's edge."""
    width, height = image.size
    pixels = image.load()
    candidate = bytearray(width * height)
    for y in range(height):
        for x in range(width):
            if sum((a - b) ** 2 for a, b in zip(pixels[x, y], background)) >= 90 ** 2:
                candidate[y * width + x] = 1

    mask = bytearray(candidate)
    # Whatever is joined to the edge is a frame or border, such as a drawn CRT screen.
    stack = [i for i in range(width) if candidate[i]]
    stack += [(height - 1) * width + i for i in range(width) if candidate[(height - 1) * width + i]]
    stack += [y * width for y in range(height) if candidate[y * width]]
    stack += [y * width + width - 1 for y in range(height) if candidate[y * width + width - 1]]
    while stack:
        i = stack.pop()
        if not mask[i]:
            continue
        mask[i] = 0
        x, y = i % width, i // width
        if x > 0 and mask[i - 1]:
            stack.append(i - 1)
        if x < width - 1 and mask[i + 1]:
            stack.append(i + 1)
        if y > 0 and mask[i - width]:
            stack.append(i - width)
        if y < height - 1 and mask[i + width]:
            stack.append(i + width)
    return mask if any(mask) else candidate


def sprite(image, width, height, colors):
    """Removes a solid background first, so its color does not take over the palette."""
    source = image.convert('RGB')
    src_w, src_h = source.size
    mask = foreground_mask(source, dominant_color(source))
    if not any(mask):
        raise SystemExit('The image is only background')
    xs = [i % src_w for i, on in enumerate(mask) if on]
    ys = [i // src_w for i, on in enumerate(mask) if on]
    box = (min(xs), min(ys), max(xs) + 1, max(ys) + 1)
    scale = min(width / (box[2] - box[0]), height / (box[3] - box[1]))
    size = (max(1, round((box[2] - box[0]) * scale)), max(1, round((box[3] - box[1]) * scale)))

    # NEAREST keeps the source's hard pixel edges, and no background blends into them.
    def source_of(x, y):
        return (box[0] + int((x + 0.5) * (box[2] - box[0]) / size[0]), box[1] + int((y + 0.5) * (box[3] - box[1]) / size[1]))

    kept = []
    for y in range(size[1]):
        for x in range(size[0]):
            sx, sy = source_of(x, y)
            if mask[sy * src_w + sx]:
                kept.append((x, y, source.getpixel((sx, sy))))
    if not kept:
        raise SystemExit('The image is only background')

    strip = Image.new('RGB', (len(kept), 1))
    strip.putdata([pixel for _, _, pixel in kept])
    limited = strip.quantize(colors=colors, dither=Image.Dither.NONE).convert('RGB')
    mapped = {}
    out = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    left, top = (width - size[0]) // 2, (height - size[1]) // 2
    for i, (x, y, _) in enumerate(kept):
        color = limited.getpixel((i, 0))
        mapped.setdefault(color, nearest_nes(color))
        out.putpixel((left + x, top + y), mapped[color] + (255,))
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input')
    parser.add_argument('output')
    parser.add_argument('--width', type=int)
    parser.add_argument('--height', type=int)
    parser.add_argument('--colors', type=int, default=16)
    parser.add_argument('--key', action='store_true')
    parser.add_argument('--crop', action='store_true', help='crop to the target shape instead of stretching')
    parser.add_argument('--keep-colors', action='store_true', help="reduce the image's own colors without the NES palette")
    parser.add_argument('--max', type=int, help='convert to PNG, no larger than this')
    args = parser.parse_args()

    image = Image.open(args.input)
    if args.max:
        image = image.convert('RGB')
        image.thumbnail((args.max, args.max))
        image.save(args.output)
        return
    if args.key:
        sprite(image, args.width, args.height, args.colors).save(args.output)
        return
    nesify(image, args.width, args.height, args.colors, args.crop, args.keep_colors).save(args.output)


if __name__ == '__main__':
    main()
