#!/usr/bin/env python3
"""
Generates 48x48 PNG icons for all 15 D&D 5e SRD status conditions.
"""
import os
import json
from PIL import Image, ImageDraw, ImageFont

ICONS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "icons", "status_effects")
os.makedirs(ICONS_DIR, exist_ok=True)

CONDITIONS = {
    "blinded": {"symbol": "👁️", "fallback": "BL", "color": (231, 76, 60), "bg": (44, 19, 16)},
    "charmed": {"symbol": "💖", "fallback": "CH", "color": (232, 67, 147), "bg": (50, 15, 33)},
    "deafened": {"symbol": "🔇", "fallback": "DF", "color": (149, 165, 166), "bg": (35, 40, 42)},
    "exhaustion": {"symbol": "⚡", "fallback": "EX", "color": (211, 84, 0), "bg": (52, 23, 5)},
    "frightened": {"symbol": "😱", "fallback": "FR", "color": (155, 89, 182), "bg": (38, 20, 46)},
    "grappled": {"symbol": "✊", "fallback": "GR", "color": (243, 156, 18), "bg": (55, 36, 6)},
    "incapacitated": {"symbol": "⛔", "fallback": "IN", "color": (192, 57, 43), "bg": (45, 15, 12)},
    "invisible": {"symbol": "👤", "fallback": "INV", "color": (52, 152, 219), "bg": (12, 36, 54)},
    "paralyzed": {"symbol": "⚡", "fallback": "PA", "color": (241, 196, 15), "bg": (55, 46, 6)},
    "petrified": {"symbol": "🗿", "fallback": "PE", "color": (127, 140, 141), "bg": (30, 34, 35)},
    "poisoned": {"symbol": "☠️", "fallback": "PO", "color": (39, 174, 96), "bg": (9, 44, 23)},
    "prone": {"symbol": "⤵️", "fallback": "PR", "color": (230, 126, 34), "bg": (53, 29, 8)},
    "restrained": {"symbol": "⛓️", "fallback": "RE", "color": (22, 160, 133), "bg": (6, 40, 33)},
    "stunned": {"symbol": "💫", "fallback": "ST", "color": (243, 156, 18), "bg": (55, 36, 6)},
    "unconscious": {"symbol": "💤", "fallback": "UN", "color": (44, 62, 80), "bg": (15, 22, 30)}
}

def generate_icons():
    size = (48, 48)
    for cond_id, info in CONDITIONS.items():
        img = Image.new("RGBA", size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        # Border and background pill
        draw.rounded_rectangle([2, 2, 45, 45], radius=8, fill=info["bg"], outline=info["color"], width=2)
        
        # Inner glow or decorative accent
        draw.rounded_rectangle([5, 5, 42, 42], radius=6, outline=(info["color"][0], info["color"][1], info["color"][2], 120), width=1)
        
        # Draw condition text label centered
        text = info["fallback"]
        try:
            font = ImageFont.load_default()
        except Exception:
            font = None
            
        bbox = draw.textbbox((0, 0), text, font=font) if font and hasattr(draw, "textbbox") else (0, 0, 16, 10)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        x = (48 - tw) // 2
        y = (48 - th) // 2
        draw.text((x, y), text, fill=info["color"], font=font)
        
        out_path = os.path.join(ICONS_DIR, f"{cond_id}.png")
        img.save(out_path, "PNG")
        print(f"Generated {out_path}")

if __name__ == "__main__":
    generate_icons()
