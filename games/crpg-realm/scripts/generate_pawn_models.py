#!/usr/bin/env python3
"""
RobOS cRPG 3D Miniature Model Generator
Generates clean, valid glTF 2.0 binary (.glb) files for tabletop miniature pawns:
- character_knight_pawn.glb (PC Hero / Knight)
- character_king_pawn.glb (NPC King Lorik / Monarch)
- character_princess_pawn.glb (NPC Princess Gwaelin / Royal)
- monster_dragon_pawn.glb (Enemy Dragonlord / Draconic Wyrm)
- monster_goblin_pawn.glb (Enemy Goblin / Skulker)
- character_wizard_pawn.glb (PC/NPC Mage / Wizard)
- character_rogue_pawn.glb (PC/NPC Rogue / Thief)
"""

import math
import os
import struct
import json

class GLBBuilder:
    def __init__(self, name="Miniature"):
        self.name = name
        self.vertices = []  # list of (x, y, z)
        self.normals = []   # list of (nx, ny, nz)
        self.indices = []   # list of int
        self.materials = [] # list of material dicts
        self.primitives = [] # list of (material_idx, start_idx, count)
        self.cur_mat = 0

    def add_material(self, name, base_color=(0.8, 0.8, 0.8, 1.0), metallic=0.1, roughness=0.5):
        mat = {
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorFactor": list(base_color),
                "metallicFactor": float(metallic),
                "roughnessFactor": float(roughness)
            }
        }
        self.materials.append(mat)
        return len(self.materials) - 1

    def set_material(self, mat_idx):
        self.cur_mat = mat_idx

    def _add_quad(self, v0, v1, v2, v3, n):
        idx_base = len(self.vertices)
        self.vertices.extend([v0, v1, v2, v3])
        self.normals.extend([n, n, n, n])
        self.indices.extend([
            idx_base, idx_base + 1, idx_base + 2,
            idx_base, idx_base + 2, idx_base + 3
        ])

    def _add_tri(self, v0, v1, v2, n):
        idx_base = len(self.vertices)
        self.vertices.extend([v0, v1, v2])
        self.normals.extend([n, n, n])
        self.indices.extend([idx_base, idx_base + 1, idx_base + 2])

    def add_cylinder(self, center_y, radius, height, segments=16):
        y_bot = center_y - height / 2.0
        y_top = center_y + height / 2.0
        
        # Side quads
        for i in range(segments):
            a0 = 2.0 * math.pi * i / segments
            a1 = 2.0 * math.pi * (i + 1) / segments
            x0, z0 = radius * math.cos(a0), radius * math.sin(a0)
            x1, z1 = radius * math.cos(a1), radius * math.sin(a1)
            
            n0 = (math.cos((a0+a1)/2.0), 0.0, math.sin((a0+a1)/2.0))
            self._add_quad((x0, y_bot, z0), (x1, y_bot, z1), (x1, y_top, z1), (x0, y_top, z0), n0)
            
        # Top cap
        for i in range(segments):
            a0 = 2.0 * math.pi * i / segments
            a1 = 2.0 * math.pi * (i + 1) / segments
            self._add_tri((0, y_top, 0), (radius * math.cos(a0), y_top, radius * math.sin(a0)), (radius * math.cos(a1), y_top, radius * math.sin(a1)), (0, 1, 0))
            
        # Bottom cap
        for i in range(segments):
            a0 = 2.0 * math.pi * i / segments
            a1 = 2.0 * math.pi * (i + 1) / segments
            self._add_tri((0, y_bot, 0), (radius * math.cos(a1), y_bot, radius * math.sin(a1)), (radius * math.cos(a0), y_bot, radius * math.sin(a0)), (0, -1, 0))

    def add_box(self, center, size):
        cx, cy, cz = center
        sx, sy, sz = size[0]/2.0, size[1]/2.0, size[2]/2.0
        # +Y top
        self._add_quad((cx-sx, cy+sy, cz+sz), (cx+sx, cy+sy, cz+sz), (cx+sx, cy+sy, cz-sz), (cx-sx, cy+sy, cz-sz), (0, 1, 0))
        # -Y bottom
        self._add_quad((cx-sx, cy-sy, cz-sz), (cx+sx, cy-sy, cz-sz), (cx+sx, cy-sy, cz+sz), (cx-sx, cy-sy, cz+sz), (0, -1, 0))
        # +Z front
        self._add_quad((cx-sx, cy-sy, cz+sz), (cx+sx, cy-sy, cz+sz), (cx+sx, cy+sy, cz+sz), (cx-sx, cy+sy, cz+sz), (0, 0, 1))
        # -Z back
        self._add_quad((cx+sx, cy-sy, cz-sz), (cx-sx, cy-sy, cz-sz), (cx-sx, cy+sy, cz-sz), (cx+sx, cy+sy, cz-sz), (0, 0, -1))
        # +X right
        self._add_quad((cx+sx, cy-sy, cz+sz), (cx+sx, cy-sy, cz-sz), (cx+sx, cy+sy, cz-sz), (cx+sx, cy+sy, cz+sz), (1, 0, 0))
        # -X left
        self._add_quad((cx-sx, cy-sy, cz-sz), (cx-sx, cy-sy, cz+sz), (cx-sx, cy+sy, cz+sz), (cx-sx, cy+sy, cz-sz), (-1, 0, 0))

    def add_cone(self, base_y, radius, height, segments=16):
        top_y = base_y + height
        for i in range(segments):
            a0 = 2.0 * math.pi * i / segments
            a1 = 2.0 * math.pi * (i + 1) / segments
            x0, z0 = radius * math.cos(a0), radius * math.sin(a0)
            x1, z1 = radius * math.cos(a1), radius * math.sin(a1)
            am = (a0 + a1) / 2.0
            nm = (math.cos(am), 0.5, math.sin(am))
            l = math.sqrt(nm[0]**2 + nm[1]**2 + nm[2]**2)
            n = (nm[0]/l, nm[1]/l, nm[2]/l)
            self._add_tri((x0, base_y, z0), (x1, base_y, z1), (0, top_y, 0), n)
            # base cap
            self._add_tri((0, base_y, 0), (x1, base_y, z1), (x0, base_y, z0), (0, -1, 0))

    def add_sphere(self, center, radius, rings=10, sectors=14):
        cx, cy, cz = center
        for r in range(rings):
            th0 = math.pi * r / rings
            th1 = math.pi * (r + 1) / rings
            y0 = cy + radius * math.cos(th0)
            y1 = cy + radius * math.cos(th1)
            r0 = radius * math.sin(th0)
            r1 = radius * math.sin(th1)
            for s in range(sectors):
                phi0 = 2.0 * math.pi * s / sectors
                phi1 = 2.0 * math.pi * (s + 1) / sectors
                v00 = (cx + r0 * math.cos(phi0), y0, cz + r0 * math.sin(phi0))
                v01 = (cx + r0 * math.cos(phi1), y0, cz + r0 * math.sin(phi1))
                v10 = (cx + r1 * math.cos(phi0), y1, cz + r1 * math.sin(phi0))
                v11 = (cx + r1 * math.cos(phi1), y1, cz + r1 * math.sin(phi1))
                n = (math.cos(phi0)*math.sin(th0), math.cos(th0), math.sin(phi0)*math.sin(th0))
                self._add_quad(v00, v01, v11, v10, n)

    def add_base_pedestal(self, radius=0.45, height=0.10):
        # Tabletop miniature round pedestal base
        self.add_cylinder(height/2.0, radius, height, segments=20)
        # Decorative ring bevel
        self.add_cylinder(height + 0.02, radius * 0.92, 0.04, segments=20)

    def export_glb(self, filepath):
        # Pack binary buffers
        vert_data = bytearray()
        norm_data = bytearray()
        idx_data = bytearray()

        min_pos = [1e9, 1e9, 1e9]
        max_pos = [-1e9, -1e9, -1e9]

        for v in self.vertices:
            for i in range(3):
                min_pos[i] = min(min_pos[i], v[i])
                max_pos[i] = max(max_pos[i], v[i])
            vert_data.extend(struct.pack('<fff', v[0], v[1], v[2]))

        for n in self.normals:
            norm_data.extend(struct.pack('<fff', n[0], n[1], n[2]))

        for idx in self.indices:
            idx_data.extend(struct.pack('<H', idx))

        # Pad to 4-byte boundaries
        while len(vert_data) % 4 != 0: vert_data.append(0)
        while len(norm_data) % 4 != 0: norm_data.append(0)
        while len(idx_data) % 4 != 0: idx_data.append(0)

        offset_vert = 0
        len_vert = len(vert_data)
        offset_norm = len_vert
        len_norm = len(norm_data)
        offset_idx = offset_norm + len_norm
        len_idx = len(idx_data)
        total_bin_len = offset_idx + len_idx

        bin_data = vert_data + norm_data + idx_data

        gltf = {
            "asset": {"version": "2.0", "generator": "RobOS cRPG 3D Miniature Builder"},
            "scene": 0,
            "scenes": [{"name": self.name + "_Scene", "nodes": [0]}],
            "nodes": [{"name": self.name + "_Node", "mesh": 0}],
            "materials": self.materials if self.materials else [{
                "name": "DefaultMat",
                "pbrMetallicRoughness": {"baseColorFactor": [0.8, 0.8, 0.8, 1.0], "metallicFactor": 0.1, "roughnessFactor": 0.5}
            }],
            "meshes": [{
                "name": self.name + "_Mesh",
                "primitives": [{
                    "attributes": {"POSITION": 0, "NORMAL": 1},
                    "indices": 2,
                    "material": 0
                }]
            }],
            "accessors": [
                {
                    "bufferView": 0,
                    "byteOffset": 0,
                    "componentType": 5126, # FLOAT
                    "count": len(self.vertices),
                    "type": "VEC3",
                    "max": max_pos,
                    "min": min_pos
                },
                {
                    "bufferView": 1,
                    "byteOffset": 0,
                    "componentType": 5126, # FLOAT
                    "count": len(self.normals),
                    "type": "VEC3"
                },
                {
                    "bufferView": 2,
                    "byteOffset": 0,
                    "componentType": 5123, # UNSIGNED_SHORT
                    "count": len(self.indices),
                    "type": "SCALAR"
                }
            ],
            "bufferViews": [
                {"buffer": 0, "byteOffset": offset_vert, "byteLength": len_vert, "target": 34962},
                {"buffer": 0, "byteOffset": offset_norm, "byteLength": len_norm, "target": 34962},
                {"buffer": 0, "byteOffset": offset_idx, "byteLength": len_idx, "target": 34963}
            ],
            "buffers": [{"byteLength": total_bin_len}]
        }

        json_bytes = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
        while len(json_bytes) % 4 != 0:
            json_bytes += b' '

        header = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(json_bytes) + 8 + len(bin_data))
        chunk0_hdr = struct.pack('<II', len(json_bytes), 0x4E4F534A) # JSON
        chunk1_hdr = struct.pack('<II', len(bin_data), 0x004E4942)   # BIN

        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, 'wb') as f:
            f.write(header)
            f.write(chunk0_hdr)
            f.write(json_bytes)
            f.write(chunk1_hdr)
            f.write(bin_data)
        print(f"✅ Generated 3D Miniature: {filepath} ({len(self.vertices)} verts, {len(self.indices)//3} tris)")


def build_knight_pawn(filepath):
    """PC Hero / Fighter: Tabletop miniature with great helm, shield, and broadsword."""
    b = GLBBuilder("KnightPawn")
    b.add_material("KnightArmor", base_color=(0.25, 0.70, 0.95, 1.0), metallic=0.6, roughness=0.3)
    b.add_base_pedestal(radius=0.42, height=0.10)
    
    # Armored lower body / skirt
    b.add_cylinder(center_y=0.25, radius=0.22, height=0.20, segments=16)
    # Armored torso
    b.add_box(center=(0, 0.50, 0), size=(0.32, 0.30, 0.22))
    # Pauldrons (shoulder armor)
    b.add_box(center=(-0.20, 0.60, 0), size=(0.14, 0.12, 0.16))
    b.add_box(center=(0.20, 0.60, 0), size=(0.14, 0.12, 0.16))
    # Great Helm (Head)
    b.add_box(center=(0, 0.78, 0), size=(0.22, 0.24, 0.22))
    # Visor slit
    b.add_box(center=(0, 0.80, 0.11), size=(0.18, 0.05, 0.04))
    # Plume / Crest on helm
    b.add_box(center=(0, 0.95, -0.02), size=(0.06, 0.14, 0.20))
    # Shield (Left arm, facing forward)
    b.add_box(center=(-0.25, 0.46, 0.12), size=(0.06, 0.36, 0.28))
    # Broadsword (Right hand)
    b.add_box(center=(0.24, 0.55, 0.10), size=(0.04, 0.60, 0.08))
    # Crossguard
    b.add_box(center=(0.24, 0.32, 0.10), size=(0.14, 0.04, 0.08))
    
    b.export_glb(filepath)


def build_king_pawn(filepath):
    """King Lorik / Monarch: Tabletop miniature with royal mantle, ermine robe, and golden crown."""
    b = GLBBuilder("KingPawn")
    b.add_material("KingRoyal", base_color=(0.95, 0.75, 0.20, 1.0), metallic=0.7, roughness=0.3)
    b.add_base_pedestal(radius=0.45, height=0.10)
    
    # Royal Robe / Gown
    b.add_cone(base_y=0.10, radius=0.30, height=0.48, segments=16)
    # Upper Torso / Royal Mantle
    b.add_box(center=(0, 0.52, 0), size=(0.34, 0.28, 0.24))
    # Robe collar
    b.add_box(center=(0, 0.64, 0), size=(0.36, 0.08, 0.26))
    # Head
    b.add_sphere(center=(0, 0.78, 0), radius=0.14, rings=8, sectors=12)
    # Royal Crown
    b.add_cylinder(center_y=0.90, radius=0.16, height=0.10, segments=16)
    # Crown peaks (4 spikes)
    b.add_box(center=(0, 0.98, 0.15), size=(0.05, 0.08, 0.03))
    b.add_box(center=(0, 0.98, -0.15), size=(0.05, 0.08, 0.03))
    b.add_box(center=(0.15, 0.98, 0), size=(0.03, 0.08, 0.05))
    b.add_box(center=(-0.15, 0.98, 0), size=(0.03, 0.08, 0.05))
    # Royal Scepter in right hand
    b.add_cylinder(center_y=0.55, radius=0.025, height=0.55, segments=8)
    b.add_sphere(center=(0.22, 0.82, 0.10), radius=0.06, rings=6, sectors=8)

    b.export_glb(filepath)


def build_princess_pawn(filepath):
    """Princess Gwaelin / Royal: Tabletop miniature with bell gown, golden tiara, and royal sash."""
    b = GLBBuilder("PrincessPawn")
    b.add_material("PrincessRose", base_color=(0.95, 0.40, 0.70, 1.0), metallic=0.3, roughness=0.4)
    b.add_base_pedestal(radius=0.40, height=0.10)

    # Bell Gown
    b.add_cone(base_y=0.10, radius=0.32, height=0.50, segments=16)
    # Bodice / Torso
    b.add_box(center=(0, 0.52, 0), size=(0.24, 0.24, 0.18))
    # Head
    b.add_sphere(center=(0, 0.74, 0), radius=0.13, rings=8, sectors=12)
    # Flowing hair (back)
    b.add_box(center=(0, 0.65, -0.10), size=(0.22, 0.28, 0.10))
    # Golden Tiara
    b.add_cylinder(center_y=0.84, radius=0.14, height=0.06, segments=14)
    b.add_box(center=(0, 0.88, 0.13), size=(0.06, 0.06, 0.02))

    b.export_glb(filepath)


def build_dragon_pawn(filepath):
    """Dragonlord / Boss: Tabletop miniature with scaled draconic torso, horns, bat wings, and tail."""
    b = GLBBuilder("DragonlordPawn")
    b.add_material("DragonlordCrimson", base_color=(0.85, 0.15, 0.20, 1.0), metallic=0.5, roughness=0.35)
    b.add_base_pedestal(radius=0.50, height=0.12)

    # Draconic lower body
    b.add_cylinder(center_y=0.28, radius=0.30, height=0.25, segments=16)
    # Chest / Torso
    b.add_box(center=(0, 0.55, 0), size=(0.42, 0.36, 0.30))
    # Scaled back ridge
    b.add_box(center=(0, 0.60, -0.16), size=(0.06, 0.40, 0.08))
    # Draconic Head with muzzle
    b.add_box(center=(0, 0.82, 0.05), size=(0.26, 0.22, 0.30))
    b.add_box(center=(0, 0.77, 0.22), size=(0.18, 0.14, 0.16)) # snout
    # Curved Horns
    b.add_box(center=(-0.14, 0.98, -0.05), size=(0.06, 0.22, 0.06))
    b.add_box(center=(0.14, 0.98, -0.05), size=(0.06, 0.22, 0.06))
    # Bat Wings (Left & Right)
    b.add_box(center=(-0.38, 0.75, -0.12), size=(0.36, 0.40, 0.04))
    b.add_box(center=(0.38, 0.75, -0.12), size=(0.36, 0.40, 0.04))
    # Tail (trailing back)
    b.add_box(center=(0, 0.20, -0.32), size=(0.10, 0.10, 0.36))

    b.export_glb(filepath)


def build_goblin_pawn(filepath):
    """Goblin Creature / Skulker: Pointed ears, curved spine, jagged blade."""
    b = GLBBuilder("GoblinPawn")
    b.add_material("GoblinGreen", base_color=(0.35, 0.75, 0.25, 1.0), metallic=0.2, roughness=0.6)
    b.add_base_pedestal(radius=0.35, height=0.08)

    # Crouched body
    b.add_sphere(center=(0, 0.30, 0), radius=0.18, rings=6, sectors=10)
    # Slouched Torso
    b.add_box(center=(0, 0.45, 0.04), size=(0.24, 0.22, 0.18))
    # Goblin Head
    b.add_sphere(center=(0, 0.62, 0.10), radius=0.14, rings=6, sectors=10)
    # Pointed Ears (flared out)
    b.add_box(center=(-0.20, 0.64, 0.08), size=(0.14, 0.06, 0.04))
    b.add_box(center=(0.20, 0.64, 0.08), size=(0.14, 0.06, 0.04))
    # Jagged Dagger in hand
    b.add_box(center=(0.20, 0.38, 0.18), size=(0.04, 0.28, 0.06))

    b.export_glb(filepath)


def build_wizard_pawn(filepath):
    """Wizard / Sorcerer: Pointed wizard hat, long robes, arcane staff."""
    b = GLBBuilder("WizardPawn")
    b.add_material("WizardPurple", base_color=(0.55, 0.25, 0.85, 1.0), metallic=0.3, roughness=0.45)
    b.add_base_pedestal(radius=0.40, height=0.10)

    # Robes
    b.add_cone(base_y=0.10, radius=0.28, height=0.48, segments=14)
    # Torso
    b.add_box(center=(0, 0.52, 0), size=(0.28, 0.24, 0.20))
    # Head & Beard
    b.add_sphere(center=(0, 0.72, 0), radius=0.13, rings=8, sectors=10)
    b.add_cone(base_y=0.55, radius=0.10, height=-0.15, segments=8) # beard
    # Pointed Wizard Hat
    b.add_cylinder(center_y=0.82, radius=0.24, height=0.04, segments=16) # brim
    b.add_cone(base_y=0.83, radius=0.15, height=0.32, segments=12) # cone
    # Arcane Staff
    b.add_cylinder(center_y=0.50, radius=0.02, height=0.85, segments=8)
    b.add_sphere(center=(0.24, 0.95, 0.10), radius=0.06, rings=6, sectors=8) # glowing orb

    b.export_glb(filepath)


def build_rogue_pawn(filepath):
    """Rogue / Assassin: Cowl hood, leather tunic, twin daggers."""
    b = GLBBuilder("RoguePawn")
    b.add_material("RogueDark", base_color=(0.22, 0.24, 0.28, 1.0), metallic=0.2, roughness=0.7)
    b.add_base_pedestal(radius=0.38, height=0.09)

    # Agile legs / body
    b.add_cylinder(center_y=0.24, radius=0.18, height=0.20, segments=12)
    b.add_box(center=(0, 0.48, 0), size=(0.28, 0.26, 0.20))
    # Hooded head
    b.add_sphere(center=(0, 0.72, 0), radius=0.15, rings=8, sectors=10)
    b.add_box(center=(0, 0.80, -0.06), size=(0.20, 0.16, 0.18)) # cowl peak
    # Twin daggers
    b.add_box(center=(-0.20, 0.42, 0.14), size=(0.03, 0.26, 0.05))
    b.add_box(center=(0.20, 0.42, 0.14), size=(0.03, 0.26, 0.05))

    b.export_glb(filepath)


if __name__ == "__main__":
    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets", "models"))
    print(f"Generating 3D tabletop miniature models into: {out_dir}")
    build_knight_pawn(os.path.join(out_dir, "character_knight_pawn.glb"))
    build_king_pawn(os.path.join(out_dir, "character_king_pawn.glb"))
    build_princess_pawn(os.path.join(out_dir, "character_princess_pawn.glb"))
    build_dragon_pawn(os.path.join(out_dir, "monster_dragon_pawn.glb"))
    build_goblin_pawn(os.path.join(out_dir, "monster_goblin_pawn.glb"))
    build_wizard_pawn(os.path.join(out_dir, "character_wizard_pawn.glb"))
    build_rogue_pawn(os.path.join(out_dir, "character_rogue_pawn.glb"))
    print("✨ All 7 tabletop miniature 3D models generated successfully!")
