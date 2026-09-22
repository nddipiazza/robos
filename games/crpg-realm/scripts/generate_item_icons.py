#!/usr/bin/env python3
"""
Generates missing 48x48 PNG icons for weapons, armors, potions, and tools.
"""
import os
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "icons")

ITEMS = {
    # Weapons
    "weapons/shortsword.png": {"text": "SS", "bg": (35, 45, 55), "fg": (180, 210, 240)},
    "weapons/warhammer.png": {"text": "WH", "bg": (50, 40, 35), "fg": (220, 180, 140)},
    "weapons/morningstar.png": {"text": "MS", "bg": (45, 40, 45), "fg": (230, 200, 180)},
    "weapons/rapier.png": {"text": "RP", "bg": (30, 40, 50), "fg": (200, 230, 255)},
    "weapons/longbow.png": {"text": "LB", "bg": (40, 35, 25), "fg": (210, 170, 110)},
    "weapons/heavy_crossbow.png": {"text": "HX", "bg": (45, 35, 30), "fg": (210, 160, 120)},
    "weapons/spear.png": {"text": "SP", "bg": (35, 40, 35), "fg": (190, 220, 190)},
    
    # Armors
    "armor/padded.png": {"text": "PAD", "bg": (45, 35, 25), "fg": (200, 170, 130)},
    "armor/studded_leather.png": {"text": "SL", "bg": (40, 30, 25), "fg": (210, 150, 100)},
    "armor/hide_armor.png": {"text": "HD", "bg": (45, 30, 20), "fg": (200, 140, 90)},
    "armor/chain_shirt.png": {"text": "CS", "bg": (35, 40, 45), "fg": (190, 200, 210)},
    "armor/scale_mail.png": {"text": "SM", "bg": (30, 40, 45), "fg": (170, 210, 220)},
    "armor/breastplate.png": {"text": "BP", "bg": (40, 45, 50), "fg": (210, 225, 240)},
    "armor/half_plate.png": {"text": "HP", "bg": (45, 45, 50), "fg": (220, 230, 245)},
    "armor/ring_mail.png": {"text": "RM", "bg": (40, 40, 45), "fg": (190, 190, 205)},
    "armor/splint_armor.png": {"text": "SP", "bg": (45, 45, 48), "fg": (215, 220, 230)},
    
    # Potions & Tools
    "potions/potion_healing.png": {"text": "HP", "bg": (50, 15, 15), "fg": (255, 80, 80)},
    "potions/potion_greater_healing.png": {"text": "GHP", "bg": (60, 10, 10), "fg": (255, 120, 120)},
    "potions/potion_speed.png": {"text": "SPD", "bg": (15, 40, 60), "fg": (80, 200, 255)},
    "potions/antidote.png": {"text": "ANT", "bg": (15, 50, 25), "fg": (80, 255, 140)},
    "tools/thieves_tools.png": {"text": "TT", "bg": (40, 35, 25), "fg": (230, 200, 120)},
    "tools/torch.png": {"text": "TOR", "bg": (50, 30, 10), "fg": (255, 160, 40)},
    "tools/rations.png": {"text": "RAT", "bg": (40, 30, 20), "fg": (210, 170, 110)},
    
    # Spells
    "spells/healing_word.png": {"text": "HW", "bg": (15, 45, 30), "fg": (80, 255, 160)},
    "spells/mage_armor.png": {"text": "MA", "bg": (20, 35, 55), "fg": (100, 190, 255)},
    "spells/thunderwave.png": {"text": "TW", "bg": (25, 40, 60), "fg": (120, 200, 255)},
    "spells/bless.png": {"text": "BL", "bg": (50, 45, 15), "fg": (255, 230, 80)},
    "spells/hold_person.png": {"text": "HP", "bg": (45, 20, 50), "fg": (220, 120, 240)},
    "spells/invisibility.png": {"text": "INV", "bg": (20, 35, 50), "fg": (130, 210, 255)},
    "spells/spiritual_weapon.png": {"text": "SW", "bg": (45, 40, 20), "fg": (240, 220, 100)},
    "spells/haste.png": {"text": "HST", "bg": (45, 35, 10), "fg": (255, 210, 60)},
    "spells/lightning_bolt.png": {"text": "LB", "bg": (20, 35, 60), "fg": (140, 220, 255)},
    "spells/counterspell.png": {"text": "CS", "bg": (35, 20, 55), "fg": (200, 130, 255)}
}

def generate():
    for rel_path, info in ITEMS.items():
        full_path = os.path.join(BASE_DIR, rel_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        img = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        draw.rounded_rectangle([2, 2, 45, 45], radius=6, fill=info["bg"], outline=info["fg"], width=2)
        draw.rounded_rectangle([5, 5, 42, 42], radius=4, outline=(info["fg"][0], info["fg"][1], info["fg"][2], 80), width=1)
        
        text = info["text"]
        try:
            font = ImageFont.load_default()
        except Exception:
            font = None
            
        bbox = draw.textbbox((0, 0), text, font=font) if font and hasattr(draw, "textbbox") else (0, 0, 16, 10)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        x = (48 - tw) // 2
        y = (48 - th) // 2
        draw.text((x, y), text, fill=info["fg"], font=font)
        
        img.save(full_path, "PNG")
        print(f"Generated {full_path}")

if __name__ == "__main__":
    generate()
