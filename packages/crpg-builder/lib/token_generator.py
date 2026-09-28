#!/usr/bin/env python3
"""
RobOS cRPG Token Generator
Generates anti-aliased circular VTT battle tokens with metallic border rings
and drop shadows from 2D character and monster portraits.
"""

import os
import sys
import argparse
from PIL import Image, ImageDraw, ImageOps, ImageFilter

RING_COLORS = {
    'gold': (218, 165, 32, 255),      # Player Heroes
    'crimson': (220, 20, 60, 255),    # Bosses & Nemeses
    'amber': (255, 140, 0, 255),      # Enemies & Monsters
    'cyan': (0, 188, 212, 255),       # Magic & Spells
    'emerald': (46, 204, 113, 255),   # NPCs & Allies
    'silver': (192, 192, 192, 255),   # Common Combatants
}

def generate_token(
    source_path: str,
    output_path: str,
    size: int = 256,
    ring_type: str = 'gold',
    ring_width: int = 14
) -> str:
    """Generate a high-definition circular battle token from a portrait image."""
    if not os.path.exists(source_path):
        raise FileNotFoundError(f"Source portrait not found: {source_path}")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    
    # 2x supersampling for ultra-crisp anti-aliasing
    scale = 2
    render_size = size * scale
    rw = ring_width * scale

    src = Image.open(source_path).convert('RGBA')

    # Square crop from top-center (better for character busts)
    min_dim = min(src.size)
    left = (src.width - min_dim) // 2
    top = max(0, int((src.height - min_dim) * 0.15)) # slight top bias for faces
    if top + min_dim > src.height:
        top = src.height - min_dim
    cropped = src.crop((left, top, left + min_dim, top + min_dim))
    resized = cropped.resize((render_size, render_size), Image.Resampling.LANCZOS)

    # Circular mask for portrait image
    mask = Image.new('L', (render_size, render_size), 0)
    draw_mask = ImageDraw.Draw(mask)
    draw_mask.ellipse((rw // 2, rw // 2, render_size - 1 - rw // 2, render_size - 1 - rw // 2), fill=255)

    # Base image with masked portrait
    token_canvas = Image.new('RGBA', (render_size, render_size), (0, 0, 0, 0))
    token_canvas.paste(resized, (0, 0), mask=mask)

    # Draw border rings
    color = RING_COLORS.get(ring_type.lower(), RING_COLORS['gold'])
    draw = ImageDraw.Draw(token_canvas)

    # Outer ring
    draw.ellipse((rw // 2, rw // 2, render_size - 1 - rw // 2, render_size - 1 - rw // 2), outline=color, width=rw)

    # Inner dark containment ring
    inner_inset = rw
    draw.ellipse(
        (inner_inset, inner_inset, render_size - 1 - inner_inset, render_size - 1 - inner_inset),
        outline=(15, 20, 30, 220),
        width=max(2, scale * 2)
    )
    # Outer dark edge
    draw.ellipse(
        (0, 0, render_size - 1, render_size - 1),
        outline=(10, 15, 20, 240),
        width=max(2, scale * 2)
    )

    # Downsample back to target size with high-quality resampling
    final_token = token_canvas.resize((size, size), Image.Resampling.LANCZOS)
    final_token.save(output_path, 'PNG', optimize=True)
    return output_path

def batch_seed_tokens(portraits_dir: str, tokens_dir: str):
    """Seed starter tokens for core game portraits."""
    seeds = [
        ('portrait_fighter.png', 'token_fighter.png', 'gold'),
        ('portrait_wizard.png', 'token_wizard.png', 'cyan'),
        ('portrait_rogue.png', 'token_rogue.png', 'emerald'),
        ('portrait_cleric.png', 'token_cleric.png', 'gold'),
        ('portrait_brand.png', 'token_brand_paladin.png', 'gold'),
        ('portrait_elora.png', 'token_elora_ranger.png', 'emerald'),
        ('portrait_malakor.png', 'token_malakor_boss.png', 'crimson'),
        ('portrait_barbarian.png', 'token_barbarian.png', 'amber'),
        ('portrait_bard.png', 'token_bard.png', 'cyan'),
        ('portrait_druid.png', 'token_druid.png', 'emerald'),
        ('portrait_monk.png', 'token_monk.png', 'gold'),
        ('portrait_paladin.png', 'token_paladin.png', 'gold'),
        ('portrait_ranger.png', 'token_ranger.png', 'emerald'),
        ('portrait_sorcerer.png', 'token_sorcerer.png', 'cyan'),
        ('portrait_warlock.png', 'token_warlock.png', 'crimson'),
    ]

    count = 0
    for src_name, dst_name, ring in seeds:
        src = os.path.join(portraits_dir, src_name)
        dst = os.path.join(tokens_dir, dst_name)
        if os.path.exists(src):
            generate_token(src, dst, size=256, ring_type=ring)
            count += 1
    print(f"Generated {count} battle tokens in {tokens_dir}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="RobOS cRPG Token Generator")
    parser.add_argument('--src', help="Source portrait image path")
    parser.add_argument('--dst', help="Output token image path")
    parser.add_argument('--ring', default='gold', choices=list(RING_COLORS.keys()), help="Ring color scheme")
    parser.add_argument('--size', type=int, default=256, help="Output token pixel dimension (width=height)")
    parser.add_argument('--seed', action='store_true', help="Seed tokens from assets/portraits/ into assets/tokens/")
    parser.add_argument('--portraits-dir', default='games/crpg-realm/assets/portraits')
    parser.add_argument('--tokens-dir', default='games/crpg-realm/assets/tokens')

    args = parser.parse_args()

    if args.seed:
        batch_seed_tokens(args.portraits_dir, args.tokens_dir)
    elif args.src and args.dst:
        generate_token(args.src, args.dst, size=args.size, ring_type=args.ring)
        print(f"Token saved to: {args.dst}")
    else:
        parser.print_help()
