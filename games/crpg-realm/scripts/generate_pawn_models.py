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

    def add_ring(self, center_y, inner_radius, outer_radius, height, segments=16):
        y_bot = center_y - height / 2.0
        y_top = center_y + height / 2.0
        for i in range(segments):
            a0 = 2.0 * math.pi * i / segments
            a1 = 2.0 * math.pi * (i + 1) / segments
            ox0, oz0 = outer_radius * math.cos(a0), outer_radius * math.sin(a0)
            ox1, oz1 = outer_radius * math.cos(a1), outer_radius * math.sin(a1)
            no = (math.cos((a0+a1)/2.0), 0.0, math.sin((a0+a1)/2.0))
            self._add_quad((ox0, y_bot, oz0), (ox1, y_bot, oz1), (ox1, y_top, oz1), (ox0, y_top, oz0), no)
            ix0, iz0 = inner_radius * math.cos(a0), inner_radius * math.sin(a0)
            ix1, iz1 = inner_radius * math.cos(a1), inner_radius * math.sin(a1)
            ni = (-math.cos((a0+a1)/2.0), 0.0, -math.sin((a0+a1)/2.0))
            self._add_quad((ix1, y_bot, iz1), (ix0, y_bot, iz0), (ix0, y_top, iz0), (ix1, y_top, iz1), ni)
            self._add_quad((ix0, y_top, iz0), (ix1, y_top, iz1), (ox1, y_top, oz1), (ox0, y_top, oz0), (0, 1, 0))
            self._add_quad((ox0, y_bot, oz0), (ox1, y_bot, oz1), (ix1, y_bot, iz1), (ix0, y_bot, iz0), (0, -1, 0))

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


def build_skeleton_pawn(filepath):
    """Skeleton Pawn: Tabletop miniature with bone ivory ribs, skull, and rusted scythe."""
    b = GLBBuilder("SkeletonPawn")
    b.add_material("SkeletonBone", base_color=(0.88, 0.85, 0.76, 1.0), metallic=0.1, roughness=0.8)
    b.add_base_pedestal(radius=0.38, height=0.08)

    # Spinal column and thin skeletal legs
    b.add_cylinder(center_y=0.16, radius=0.03, height=0.16, segments=8)
    b.add_cylinder(center_y=0.38, radius=0.035, height=0.30, segments=8)
    # Pelvis
    b.add_box(center=(0, 0.24, 0), size=(0.20, 0.05, 0.12))
    # Rib cage (3 horizontal rings of bone bars)
    b.add_box(center=(0, 0.40, 0.01), size=(0.22, 0.03, 0.14))
    b.add_box(center=(0, 0.46, 0.01), size=(0.25, 0.03, 0.15))
    b.add_box(center=(0, 0.52, 0.01), size=(0.23, 0.03, 0.13))
    # Collarbones / shoulders
    b.add_box(center=(0, 0.57, 0), size=(0.28, 0.04, 0.06))
    # Skull & jaw
    b.add_sphere(center=(0, 0.69, 0), radius=0.12, rings=8, sectors=10)
    b.add_box(center=(0, 0.62, 0.04), size=(0.09, 0.06, 0.08))
    # Dark eye sockets
    b.add_box(center=(-0.04, 0.70, 0.09), size=(0.03, 0.03, 0.03))
    b.add_box(center=(0.04, 0.70, 0.09), size=(0.03, 0.03, 0.03))
    # Right arm holding scythe/blade
    b.add_cylinder(center_y=0.48, radius=0.02, height=0.75, segments=8)
    b.add_box(center=(0.14, 0.82, 0.06), size=(0.26, 0.08, 0.02))

    b.export_glb(filepath)


def build_minotaur_pawn(filepath):
    """Minotaur Pawn: Muscular brute miniature with sweeping horns, septum ring, and battleaxe."""
    b = GLBBuilder("MinotaurPawn")
    b.add_material("MinotaurHide", base_color=(0.42, 0.26, 0.16, 1.0), metallic=0.2, roughness=0.7)
    b.add_base_pedestal(radius=0.52, height=0.12)

    # Heavy hooved legs
    b.add_cylinder(center_y=0.20, radius=0.12, height=0.24, segments=12)
    # Muscular torso & massive shoulders
    b.add_box(center=(0, 0.54, 0), size=(0.48, 0.38, 0.32))
    b.add_box(center=(-0.12, 0.58, 0.14), size=(0.18, 0.16, 0.08))
    b.add_box(center=(0.12, 0.58, 0.14), size=(0.18, 0.16, 0.08))
    # Trapezius / thick neck
    b.add_box(center=(0, 0.70, -0.02), size=(0.34, 0.14, 0.26))
    # Bovine Head & Snout
    b.add_box(center=(0, 0.78, 0.10), size=(0.26, 0.22, 0.24))
    b.add_box(center=(0, 0.72, 0.22), size=(0.18, 0.12, 0.14))
    # Septum ring
    b.add_ring(center_y=0.66, inner_radius=0.025, outer_radius=0.05, height=0.02)
    # Sweeping curved horns
    b.add_box(center=(-0.24, 0.90, 0.02), size=(0.18, 0.08, 0.08))
    b.add_box(center=(-0.30, 0.98, 0.08), size=(0.07, 0.14, 0.07))
    b.add_box(center=(0.24, 0.90, 0.02), size=(0.18, 0.08, 0.08))
    b.add_box(center=(0.30, 0.98, 0.08), size=(0.07, 0.14, 0.07))
    # Double-bitted Battleaxe in right hand
    b.add_cylinder(center_y=0.60, radius=0.03, height=0.95, segments=8)
    b.add_box(center=(0.24, 0.88, 0.08), size=(0.22, 0.18, 0.03))
    b.add_box(center=(0.24, 0.88, -0.08), size=(0.20, 0.16, 0.03))

    b.export_glb(filepath)


def build_hound_pawn(filepath):
    """Hound / Dire Wolf Pawn: Quadruped predator miniature with spiked collar and bristling tail."""
    b = GLBBuilder("HoundPawn")
    b.add_material("DireHoundFur", base_color=(0.24, 0.24, 0.28, 1.0), metallic=0.1, roughness=0.85)
    b.add_base_pedestal(radius=0.46, height=0.09)

    # Quadruped body
    b.add_box(center=(0, 0.36, -0.02), size=(0.26, 0.24, 0.48))
    # 4 legs
    b.add_cylinder(center_y=0.18, radius=0.05, height=0.20, segments=8)
    # Muscular chest & raised neck
    b.add_box(center=(0, 0.46, 0.18), size=(0.24, 0.22, 0.22))
    # Lupine head & sharp muzzle
    b.add_box(center=(0, 0.58, 0.28), size=(0.20, 0.18, 0.20))
    b.add_box(center=(0, 0.53, 0.38), size=(0.12, 0.10, 0.16))
    # Pointed ears
    b.add_box(center=(-0.08, 0.70, 0.24), size=(0.05, 0.10, 0.04))
    b.add_box(center=(0.08, 0.70, 0.24), size=(0.05, 0.10, 0.04))
    # Spiked collar
    b.add_box(center=(0, 0.48, 0.20), size=(0.28, 0.06, 0.26))
    # Arched tail
    b.add_box(center=(0, 0.38, -0.32), size=(0.08, 0.08, 0.24))

    b.export_glb(filepath)


def build_skirmisher_pawn(filepath):
    """Skirmisher Pawn: Brigand scout with woodland leather, spiked buckler, spear, and quiver."""
    b = GLBBuilder("SkirmisherPawn")
    b.add_material("SkirmisherLeather", base_color=(0.38, 0.44, 0.28, 1.0), metallic=0.2, roughness=0.7)
    b.add_base_pedestal(radius=0.40, height=0.09)

    # Legs & Boots
    b.add_cylinder(center_y=0.22, radius=0.18, height=0.22, segments=12)
    # Leather brigandine torso
    b.add_box(center=(0, 0.48, 0), size=(0.28, 0.26, 0.20))
    # Belt & side pouch
    b.add_box(center=(0, 0.35, 0.01), size=(0.30, 0.05, 0.21))
    b.add_box(center=(0.14, 0.34, 0.08), size=(0.06, 0.07, 0.06))
    # Head & Scout Cap
    b.add_sphere(center=(0, 0.70, 0), radius=0.13, rings=8, sectors=10)
    b.add_box(center=(0, 0.76, -0.02), size=(0.20, 0.08, 0.20))
    # Left arm spiked buckler
    b.add_cylinder(center_y=0.45, radius=0.14, height=0.04, segments=12)
    b.add_cone(base_y=0.45, radius=0.04, height=0.08, segments=8)
    # Right hand spear
    b.add_cylinder(center_y=0.55, radius=0.02, height=0.90, segments=8)
    b.add_cone(base_y=0.98, radius=0.04, height=0.14, segments=8)
    # Back quiver
    b.add_box(center=(-0.08, 0.54, -0.14), size=(0.08, 0.28, 0.08))

    b.export_glb(filepath)


def build_weapon_sword_iron(filepath):
    """Iron Sword: Straight steel blade, crossguard, and round pommel."""
    b = GLBBuilder("WeaponSwordIron")
    b.add_material("SwordIron", base_color=(0.72, 0.75, 0.80, 1.0), metallic=0.8, roughness=0.25)
    # Grip
    b.add_cylinder(center_y=-0.04, radius=0.02, height=0.14, segments=8)
    # Pommel
    b.add_sphere(center=(0, -0.12, 0), radius=0.035, rings=6, sectors=8)
    # Crossguard
    b.add_box(center=(0, 0.04, 0), size=(0.18, 0.03, 0.04))
    # Blade
    b.add_box(center=(0, 0.36, 0), size=(0.04, 0.60, 0.015))
    # Blade tip
    b.add_cone(base_y=0.66, radius=0.03, height=0.08, segments=4)
    b.export_glb(filepath)


def build_weapon_sword_hero(filepath):
    """Hero Sword / Excalibur: Ornate mythril broadsword with winged golden crossguard and fuller."""
    b = GLBBuilder("WeaponSwordHero")
    b.add_material("SwordHeroMythril", base_color=(0.88, 0.94, 1.0, 1.0), metallic=0.9, roughness=0.15)
    # Grip
    b.add_cylinder(center_y=-0.05, radius=0.022, height=0.16, segments=10)
    # Ornate pommel with gem
    b.add_sphere(center=(0, -0.14, 0), radius=0.04, rings=8, sectors=10)
    # Winged crossguard
    b.add_box(center=(0, 0.05, 0), size=(0.26, 0.04, 0.05))
    b.add_box(center=(-0.12, 0.08, 0), size=(0.05, 0.06, 0.04))
    b.add_box(center=(0.12, 0.08, 0), size=(0.05, 0.06, 0.04))
    # Broad blade with fuller
    b.add_box(center=(0, 0.40, 0), size=(0.06, 0.66, 0.018))
    b.add_cone(base_y=0.73, radius=0.042, height=0.10, segments=4)
    b.export_glb(filepath)


def build_weapon_club_wood(filepath):
    """Wooden Club: Heavy gnarled hardwood cudgel with iron reinforcement studs."""
    b = GLBBuilder("WeaponClubWood")
    b.add_material("ClubWood", base_color=(0.45, 0.30, 0.18, 1.0), metallic=0.15, roughness=0.85)
    # Grip
    b.add_cylinder(center_y=-0.06, radius=0.026, height=0.16, segments=8)
    # Tapered striking head
    b.add_cylinder(center_y=0.15, radius=0.045, height=0.22, segments=10)
    b.add_cylinder(center_y=0.36, radius=0.070, height=0.22, segments=12)
    # Striking knob top
    b.add_sphere(center=(0, 0.48, 0), radius=0.075, rings=6, sectors=8)
    # Reinforcement bands
    b.add_ring(center_y=0.25, inner_radius=0.052, outer_radius=0.065, height=0.03)
    b.add_ring(center_y=0.40, inner_radius=0.072, outer_radius=0.085, height=0.03)
    b.export_glb(filepath)


def build_weapon_staff_wizard(filepath):
    """Wizard Staff: Carved runic elderwood staff crowned with an arcane crystal orb."""
    b = GLBBuilder("WeaponStaffWizard")
    b.add_material("StaffWizard", base_color=(0.38, 0.26, 0.18, 1.0), metallic=0.2, roughness=0.6)
    # Long staff shaft
    b.add_cylinder(center_y=0.05, radius=0.022, height=1.05, segments=8)
    # Headpiece crown prongs
    b.add_box(center=(-0.05, 0.60, 0), size=(0.02, 0.12, 0.04))
    b.add_box(center=(0.05, 0.60, 0), size=(0.02, 0.12, 0.04))
    b.add_box(center=(0, 0.60, -0.05), size=(0.04, 0.12, 0.02))
    b.add_box(center=(0, 0.60, 0.05), size=(0.04, 0.12, 0.02))
    # Arcane crystal orb
    b.add_sphere(center=(0, 0.64, 0), radius=0.065, rings=8, sectors=10)
    b.export_glb(filepath)


def build_weapon_bow_recurve(filepath):
    """Recurve Bow: Layered yew-wood bow limbs, riser grip, and taut bowstring."""
    b = GLBBuilder("WeaponBowRecurve")
    b.add_material("BowRecurve", base_color=(0.55, 0.38, 0.22, 1.0), metallic=0.1, roughness=0.6)
    # Central riser handle
    b.add_box(center=(0, 0, 0), size=(0.03, 0.14, 0.04))
    # Upper limb
    b.add_box(center=(0, 0.16, -0.04), size=(0.025, 0.18, 0.03))
    b.add_box(center=(0, 0.32, -0.10), size=(0.022, 0.16, 0.025))
    b.add_box(center=(0, 0.44, -0.07), size=(0.020, 0.10, 0.02))
    # Lower limb
    b.add_box(center=(0, -0.16, -0.04), size=(0.025, 0.18, 0.03))
    b.add_box(center=(0, -0.32, -0.10), size=(0.022, 0.16, 0.025))
    b.add_box(center=(0, -0.44, -0.07), size=(0.020, 0.10, 0.02))
    # Bowstring
    b.add_cylinder(center_y=0, radius=0.005, height=0.88, segments=4)
    b.export_glb(filepath)


def build_weapon_dagger_rogue(filepath):
    """Rogue Dagger: Blackened steel curved stealth blade with thumb guard."""
    b = GLBBuilder("WeaponDaggerRogue")
    b.add_material("DaggerRogue", base_color=(0.28, 0.30, 0.34, 1.0), metallic=0.7, roughness=0.3)
    # Grip
    b.add_cylinder(center_y=-0.04, radius=0.016, height=0.10, segments=8)
    # Curved thumbguard
    b.add_box(center=(0, 0.02, 0), size=(0.10, 0.02, 0.03))
    # Curved blade
    b.add_box(center=(0.01, 0.14, 0), size=(0.026, 0.22, 0.012))
    b.add_cone(base_y=0.25, radius=0.02, height=0.06, segments=4)
    b.export_glb(filepath)


def build_weapon_bamboo_pole(filepath):
    """Bamboo Pole: Segmented bamboo bo staff with raised nodal rings."""
    b = GLBBuilder("WeaponBambooPole")
    b.add_material("BambooPole", base_color=(0.55, 0.68, 0.28, 1.0), metallic=0.1, roughness=0.5)
    # Main bamboo shaft
    b.add_cylinder(center_y=0, radius=0.024, height=1.10, segments=10)
    # 5 Nodal bamboo rings
    for y in [-0.40, -0.20, 0.0, 0.20, 0.40]:
        b.add_ring(center_y=y, inner_radius=0.023, outer_radius=0.032, height=0.02)
    b.export_glb(filepath)


def build_armor_shield_heater(filepath):
    """Heater Shield: Azure heraldic medieval shield with reinforced rim and center cross."""
    b = GLBBuilder("ArmorShieldHeater")
    b.add_material("ShieldHeater", base_color=(0.24, 0.50, 0.85, 1.0), metallic=0.6, roughness=0.35)
    # Main shield plate
    b.add_box(center=(0, 0.05, 0), size=(0.32, 0.36, 0.03))
    # Tapered bottom triangular wedge
    b.add_cone(base_y=-0.13, radius=0.16, height=-0.18, segments=4)
    # Outer reinforced rim
    b.add_box(center=(0, 0.22, 0.01), size=(0.34, 0.03, 0.035))
    # Center heraldic cross boss
    b.add_sphere(center=(0, 0.04, 0.025), radius=0.05, rings=6, sectors=8)
    b.export_glb(filepath)


def build_armor_shield_round(filepath):
    """Round Shield: Norse / Celtic tabletop round shield with heavy iron boss and outer rim."""
    b = GLBBuilder("ArmorShieldRound")
    b.add_material("ShieldRound", base_color=(0.55, 0.42, 0.28, 1.0), metallic=0.4, roughness=0.6)
    # Round disc face
    b.add_cylinder(center_y=0, radius=0.22, height=0.025, segments=18)
    # Outer iron reinforcement rim
    b.add_ring(center_y=0, inner_radius=0.20, outer_radius=0.23, height=0.03)
    # Central hemispherical boss
    b.add_sphere(center=(0, 0.02, 0), radius=0.065, rings=6, sectors=10)
    b.export_glb(filepath)


def build_armor_helm_knight(filepath):
    """Knight Greathelm: Enclosed steel helmet with vision slit and top crest."""
    b = GLBBuilder("ArmorHelmKnight")
    b.add_material("HelmKnight", base_color=(0.75, 0.78, 0.82, 1.0), metallic=0.8, roughness=0.25)
    # Helmet bucket
    b.add_box(center=(0, 0, 0), size=(0.24, 0.26, 0.24))
    # Visor slit
    b.add_box(center=(0, 0.02, 0.12), size=(0.19, 0.04, 0.03))
    # Reinforced top crest
    b.add_box(center=(0, 0.16, -0.01), size=(0.05, 0.10, 0.22))
    b.export_glb(filepath)


def build_armor_suit_plate(filepath):
    """Plate Armor: Armored cuirass mannequin with articulated pauldrons and faulds."""
    b = GLBBuilder("ArmorSuitPlate")
    b.add_material("SuitPlate", base_color=(0.80, 0.83, 0.88, 1.0), metallic=0.85, roughness=0.2)
    b.add_base_pedestal(radius=0.30, height=0.07)
    # Stand pole
    b.add_cylinder(center_y=0.25, radius=0.03, height=0.35, segments=8)
    # Breastplate Cuirass
    b.add_box(center=(0, 0.50, 0), size=(0.34, 0.32, 0.24))
    b.add_box(center=(0, 0.52, 0.12), size=(0.20, 0.22, 0.04))
    # Pauldrons
    b.add_box(center=(-0.21, 0.58, 0), size=(0.14, 0.12, 0.18))
    b.add_box(center=(0.21, 0.58, 0), size=(0.14, 0.12, 0.18))
    # Waist fauld lames
    b.add_box(center=(0, 0.32, 0), size=(0.30, 0.10, 0.22))
    b.export_glb(filepath)


def build_armor_suit_leather(filepath):
    """Leather Armor: Studded cuir-bouilli brigandine vest mannequin with cross-straps."""
    b = GLBBuilder("ArmorSuitLeather")
    b.add_material("SuitLeather", base_color=(0.48, 0.32, 0.20, 1.0), metallic=0.2, roughness=0.75)
    b.add_base_pedestal(radius=0.28, height=0.07)
    # Stand pole
    b.add_cylinder(center_y=0.25, radius=0.03, height=0.35, segments=8)
    # Leather vest
    b.add_box(center=(0, 0.48, 0), size=(0.30, 0.30, 0.22))
    # Cross-body straps
    b.add_box(center=(0, 0.50, 0.11), size=(0.26, 0.04, 0.02))
    b.add_box(center=(0, 0.42, 0.11), size=(0.26, 0.04, 0.02))
    # Brass rivets
    b.add_box(center=(-0.10, 0.50, 0.12), size=(0.02, 0.02, 0.02))
    b.add_box(center=(0.10, 0.50, 0.12), size=(0.02, 0.02, 0.02))
    b.export_glb(filepath)


def build_spell_fireball(filepath):
    """Fireball: Blazing orange-red swirling core sphere with trailing flame cones and heat ring."""
    b = GLBBuilder("SpellFireball")
    b.add_material("SpellFireball", base_color=(0.98, 0.38, 0.05, 1.0), metallic=0.1, roughness=0.2)
    # Core fireball sphere
    b.add_sphere(center=(0, 0, 0), radius=0.18, rings=8, sectors=10)
    # Swirling flame ring
    b.add_ring(center_y=0, inner_radius=0.20, outer_radius=0.27, height=0.04)
    # Trailing flame tongues
    b.add_cone(base_y=-0.08, radius=0.10, height=-0.28, segments=6)
    b.add_box(center=(0.08, 0.08, -0.16), size=(0.06, 0.06, 0.18))
    b.add_box(center=(-0.08, -0.08, -0.16), size=(0.06, 0.06, 0.18))
    b.export_glb(filepath)


def build_spell_magic_missile(filepath):
    """Magic Missile: Arcane ethereal cyan orb with orbiting prism motes and spin ring."""
    b = GLBBuilder("SpellMagicMissile")
    b.add_material("SpellMagicMissile", base_color=(0.18, 0.65, 0.98, 1.0), metallic=0.3, roughness=0.2)
    # Central arcane energy core
    b.add_sphere(center=(0, 0, 0), radius=0.14, rings=8, sectors=10)
    # Orbital spin ring
    b.add_ring(center_y=0, inner_radius=0.22, outer_radius=0.28, height=0.03)
    # 3 orbiting diamond energy shards
    for i in range(3):
        a = 2.0 * math.pi * i / 3.0
        x, z = 0.25 * math.cos(a), 0.25 * math.sin(a)
        b.add_box(center=(x, 0, z), size=(0.05, 0.05, 0.05))
    b.export_glb(filepath)


def build_spell_healing_glyph(filepath):
    """Healing Glyph: Runic emerald restoration floor ring with center cross and vitality spark."""
    b = GLBBuilder("SpellHealingGlyph")
    b.add_material("SpellHealingGlyph", base_color=(0.15, 0.95, 0.45, 1.0), metallic=0.2, roughness=0.3)
    # Floor runic circle
    b.add_ring(center_y=0.02, inner_radius=0.35, outer_radius=0.46, height=0.03)
    # Healing cross
    b.add_box(center=(0, 0.04, 0), size=(0.36, 0.03, 0.10))
    b.add_box(center=(0, 0.04, 0), size=(0.10, 0.03, 0.36))
    # Hovering vitality orb
    b.add_sphere(center=(0, 0.20, 0), radius=0.08, rings=8, sectors=10)
    b.export_glb(filepath)


def build_spell_lightning_spark(filepath):
    """Lightning Spark: High-voltage electric bolt cluster with jagged branching energy arcing."""
    b = GLBBuilder("SpellLightningSpark")
    b.add_material("SpellLightningSpark", base_color=(0.98, 0.96, 0.25, 1.0), metallic=0.5, roughness=0.1)
    # Core electric kernel
    b.add_sphere(center=(0, 0, 0), radius=0.08, rings=6, sectors=8)
    # 4 Jagged branching lightning arms
    b.add_box(center=(0.12, 0.12, 0), size=(0.16, 0.03, 0.03))
    b.add_box(center=(0.24, 0.22, 0.05), size=(0.14, 0.03, 0.03))
    b.add_box(center=(-0.12, -0.12, 0), size=(0.16, 0.03, 0.03))
    b.add_box(center=(-0.24, -0.22, -0.05), size=(0.14, 0.03, 0.03))
    b.add_box(center=(0, 0.14, 0.14), size=(0.03, 0.16, 0.03))
    b.add_box(center=(0, -0.14, -0.14), size=(0.03, 0.16, 0.03))
    b.export_glb(filepath)


def build_spell_frost_shard(filepath):
    """Frost Shard: Double-pointed crystalline ice diamond with orbiting sub-zero icicle needles."""
    b = GLBBuilder("SpellFrostShard")
    b.add_material("SpellFrostShard", base_color=(0.65, 0.88, 0.98, 1.0), metallic=0.4, roughness=0.15)
    # Double-cone crystal diamond
    b.add_cone(base_y=0, radius=0.14, height=0.30, segments=6)
    b.add_cone(base_y=0, radius=0.14, height=-0.30, segments=6)
    # 4 orbiting icicle needles
    for i in range(4):
        a = 2.0 * math.pi * i / 4.0
        x, z = 0.24 * math.cos(a), 0.24 * math.sin(a)
        b.add_cone(base_y=-0.10, radius=0.03, height=0.20, segments=4)
    b.export_glb(filepath)


def build_spell_stinking_cloud_ring(filepath):
    """Stinking Cloud Ring: Swirling noxious miasma toroid with bubbling toxic vapor pods."""
    b = GLBBuilder("SpellStinkingCloudRing")
    b.add_material("SpellStinkingCloudRing", base_color=(0.45, 0.68, 0.18, 1.0), metallic=0.1, roughness=0.7)
    # Toxic swirling vapor ring
    b.add_ring(center_y=0.06, inner_radius=0.36, outer_radius=0.50, height=0.08)
    # 6 bubbling poison vapor pods along circumference
    for i in range(6):
        a = 2.0 * math.pi * i / 6.0
        x, z = 0.43 * math.cos(a), 0.43 * math.sin(a)
        y = 0.06 + (0.04 if i % 2 == 0 else -0.02)
        b.add_sphere(center=(x, y, z), radius=0.07, rings=6, sectors=8)
    b.export_glb(filepath)


def build_weapon_greatsword(filepath):
    """Greatsword: Massive two-handed claymore with extended grip, wide fuller, and side lugs."""
    b = GLBBuilder("WeaponGreatsword")
    b.add_material("GreatswordSteel", base_color=(0.75, 0.78, 0.82, 1.0), metallic=0.85, roughness=0.2)
    # Long two-handed grip
    b.add_cylinder(center_y=-0.08, radius=0.022, height=0.24, segments=8)
    # Faceted pommel
    b.add_sphere(center=(0, -0.22, 0), radius=0.04, rings=6, sectors=8)
    # Broad crossguard with protective lugs
    b.add_box(center=(0, 0.05, 0), size=(0.28, 0.04, 0.04))
    # Ricasso section
    b.add_box(center=(0, 0.16, 0), size=(0.06, 0.18, 0.02))
    # Long broad blade
    b.add_box(center=(0, 0.55, 0), size=(0.055, 0.60, 0.016))
    # Diamond point tip
    b.add_cone(base_y=0.85, radius=0.04, height=0.12, segments=4)
    b.export_glb(filepath)


def build_weapon_warhammer(filepath):
    """Warhammer: Dwarven forged warhammer with crushing square face and reverse beak spike."""
    b = GLBBuilder("WeaponWarhammer")
    b.add_material("WarhammerSteel", base_color=(0.58, 0.60, 0.65, 1.0), metallic=0.75, roughness=0.3)
    # Reinforced wooden shaft
    b.add_cylinder(center_y=0.15, radius=0.024, height=0.65, segments=8)
    # Grip rings
    b.add_ring(center_y=-0.05, inner_radius=0.023, outer_radius=0.030, height=0.02)
    b.add_ring(center_y=-0.12, inner_radius=0.023, outer_radius=0.030, height=0.02)
    # Heavy square striking head
    b.add_box(center=(0.07, 0.44, 0), size=(0.10, 0.09, 0.09))
    # Reverse armor-piercing spike
    b.add_box(center=(-0.08, 0.44, 0), size=(0.10, 0.05, 0.05))
    # Top crown spike
    b.add_cone(base_y=0.49, radius=0.025, height=0.08, segments=4)
    b.export_glb(filepath)


def build_weapon_mace_flanged(filepath):
    """Flanged Mace: Heavy clerical mace with steel shaft and four radial impact flanges."""
    b = GLBBuilder("WeaponMaceFlanged")
    b.add_material("MaceSteel", base_color=(0.68, 0.70, 0.75, 1.0), metallic=0.8, roughness=0.25)
    # Steel shaft
    b.add_cylinder(center_y=0.12, radius=0.022, height=0.55, segments=8)
    # Pommel
    b.add_sphere(center=(0, -0.16, 0), radius=0.035, rings=6, sectors=8)
    # Striking core
    b.add_cylinder(center_y=0.36, radius=0.04, height=0.14, segments=8)
    # 4 Steel flanges radiating outward
    b.add_box(center=(0.05, 0.36, 0), size=(0.06, 0.14, 0.015))
    b.add_box(center=(-0.05, 0.36, 0), size=(0.06, 0.14, 0.015))
    b.add_box(center=(0, 0.36, 0.05), size=(0.015, 0.14, 0.06))
    b.add_box(center=(0, 0.36, -0.05), size=(0.015, 0.14, 0.06))
    # Top finial knob
    b.add_sphere(center=(0, 0.45, 0), radius=0.035, rings=6, sectors=8)
    b.export_glb(filepath)


def build_weapon_rapier(filepath):
    """Rapier: Slender dueling blade with intricate swept cup guard and needle tip."""
    b = GLBBuilder("WeaponRapier")
    b.add_material("RapierSteel", base_color=(0.82, 0.85, 0.90, 1.0), metallic=0.9, roughness=0.18)
    # Slender grip
    b.add_cylinder(center_y=-0.04, radius=0.016, height=0.12, segments=8)
    # Teardrop pommel
    b.add_sphere(center=(0, -0.11, 0), radius=0.03, rings=6, sectors=8)
    # Swept cup guard basket
    b.add_ring(center_y=0.03, inner_radius=0.04, outer_radius=0.07, height=0.04)
    b.add_box(center=(0, 0.03, 0), size=(0.14, 0.015, 0.015))
    b.add_box(center=(0, -0.03, 0.05), size=(0.015, 0.10, 0.015))
    # Needle blade
    b.add_box(center=(0, 0.40, 0), size=(0.018, 0.70, 0.012))
    b.add_cone(base_y=0.75, radius=0.012, height=0.08, segments=4)
    b.export_glb(filepath)


def build_weapon_spear(filepath):
    """Spear: Long ash wood polearm tipped with a broad leaf steel blade and socket."""
    b = GLBBuilder("WeaponSpear")
    b.add_material("SpearWoodAndSteel", base_color=(0.60, 0.45, 0.30, 1.0), metallic=0.2, roughness=0.6)
    # Ash wood pole shaft
    b.add_cylinder(center_y=0.25, radius=0.02, height=1.20, segments=8)
    # Steel socket collar
    b.add_cylinder(center_y=0.86, radius=0.026, height=0.06, segments=8)
    # Leaf-shaped steel blade
    b.add_box(center=(0, 0.96, 0), size=(0.06, 0.20, 0.015))
    b.add_cone(base_y=1.06, radius=0.035, height=0.12, segments=4)
    # Bottom butt spike
    b.add_cone(base_y=-0.35, radius=0.022, height=-0.08, segments=4)
    b.export_glb(filepath)


def build_weapon_crossbow(filepath):
    """Crossbow: Precision mechanical arbalest with steel prod, wood stock, and stirrup."""
    b = GLBBuilder("WeaponCrossbow")
    b.add_material("CrossbowMaterial", base_color=(0.50, 0.35, 0.22, 1.0), metallic=0.3, roughness=0.5)
    # Hardwood stock / tiller
    b.add_box(center=(0, 0, 0.10), size=(0.04, 0.05, 0.50))
    # Steel transverse prod / lathe
    b.add_box(center=(0, 0.02, 0.32), size=(0.48, 0.03, 0.025))
    # Front iron cocking stirrup
    b.add_box(center=(0, 0, 0.39), size=(0.10, 0.015, 0.08))
    # Bowstring
    b.add_cylinder(center_y=0.02, radius=0.005, height=0.46, segments=4)
    # Trigger housing
    b.add_box(center=(0, -0.04, -0.05), size=(0.025, 0.05, 0.04))
    b.export_glb(filepath)


def build_weapon_battleaxe(filepath):
    """Battleaxe: Heavy crescent-bladed martial axe with reverse beard spike and top thrust tip."""
    b = GLBBuilder("WeaponBattleaxe")
    b.add_material("BattleaxeSteel", base_color=(0.70, 0.72, 0.76, 1.0), metallic=0.8, roughness=0.25)
    # Oak handle
    b.add_cylinder(center_y=0.15, radius=0.024, height=0.70, segments=8)
    # Axe eye socket
    b.add_cylinder(center_y=0.45, radius=0.038, height=0.08, segments=8)
    # Crescent curved axe blade
    b.add_box(center=(0.12, 0.45, 0), size=(0.14, 0.24, 0.018))
    b.add_box(center=(0.20, 0.45, 0), size=(0.03, 0.26, 0.01))
    # Reverse beard spike
    b.add_box(center=(-0.08, 0.45, 0), size=(0.09, 0.08, 0.02))
    # Top spear tip
    b.add_cone(base_y=0.50, radius=0.025, height=0.08, segments=4)
    b.export_glb(filepath)


def build_armor_suit_chainmail(filepath):
    """Chainmail: Knight hauberk mannequin with linked rings, mail coif, and cinched belt."""
    b = GLBBuilder("ArmorSuitChainmail")
    b.add_material("SuitChainmail", base_color=(0.65, 0.68, 0.72, 1.0), metallic=0.75, roughness=0.45)
    b.add_base_pedestal(radius=0.29, height=0.07)
    # Stand pole
    b.add_cylinder(center_y=0.25, radius=0.03, height=0.35, segments=8)
    # Mail hauberk torso
    b.add_box(center=(0, 0.48, 0), size=(0.32, 0.32, 0.24))
    # Mail coif collar
    b.add_cylinder(center_y=0.62, radius=0.10, height=0.10, segments=10)
    # Short sleeves
    b.add_box(center=(-0.19, 0.52, 0), size=(0.10, 0.14, 0.18))
    b.add_box(center=(0.19, 0.52, 0), size=(0.10, 0.14, 0.18))
    # Mail skirt
    b.add_box(center=(0, 0.28, 0), size=(0.30, 0.14, 0.22))
    # Leather belt
    b.add_box(center=(0, 0.36, 0), size=(0.33, 0.04, 0.25))
    b.export_glb(filepath)


def build_armor_shield_tower(filepath):
    """Tower Shield: Massive pavise infantry shield with reinforced iron rim and central brace."""
    b = GLBBuilder("ArmorShieldTower")
    b.add_material("ShieldTower", base_color=(0.35, 0.25, 0.18, 1.0), metallic=0.3, roughness=0.6)
    # Curved rectangular body
    b.add_box(center=(0, 0.08, 0), size=(0.30, 0.62, 0.04))
    # Iron rim reinforcement
    b.add_box(center=(0, 0.38, 0.01), size=(0.32, 0.03, 0.05))
    b.add_box(center=(0, -0.22, 0.01), size=(0.32, 0.03, 0.05))
    b.add_box(center=(-0.15, 0.08, 0.01), size=(0.03, 0.62, 0.05))
    b.add_box(center=(0.15, 0.08, 0.01), size=(0.03, 0.62, 0.05))
    # Center steel boss
    b.add_sphere(center=(0, 0.08, 0.025), radius=0.06, rings=6, sectors=8)
    b.export_glb(filepath)


def build_armor_helm_iron(filepath):
    """Iron Helmet: Classic Norman / Saxon nasal helm with conical skull cap and cheek plates."""
    b = GLBBuilder("ArmorHelmIron")
    b.add_material("HelmIron", base_color=(0.68, 0.70, 0.74, 1.0), metallic=0.8, roughness=0.3)
    # Conical dome
    b.add_cone(base_y=-0.04, radius=0.15, height=0.22, segments=12)
    # Brow band
    b.add_ring(center_y=-0.04, inner_radius=0.14, outer_radius=0.16, height=0.035)
    # Nasal bar
    b.add_box(center=(0, -0.10, 0.15), size=(0.025, 0.10, 0.015))
    # Cheek plates
    b.add_box(center=(-0.13, -0.10, 0.04), size=(0.02, 0.09, 0.08))
    b.add_box(center=(0.13, -0.10, 0.04), size=(0.02, 0.09, 0.08))
    b.export_glb(filepath)


if __name__ == "__main__":
    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets", "models"))
    print(f"Generating 3D tabletop miniature models into: {out_dir}")

    # Core Character Tabletop Miniatures
    build_knight_pawn(os.path.join(out_dir, "character_knight_pawn.glb"))
    build_king_pawn(os.path.join(out_dir, "character_king_pawn.glb"))
    build_princess_pawn(os.path.join(out_dir, "character_princess_pawn.glb"))
    build_wizard_pawn(os.path.join(out_dir, "character_wizard_pawn.glb"))
    build_rogue_pawn(os.path.join(out_dir, "character_rogue_pawn.glb"))

    # Monster Miniatures
    build_dragon_pawn(os.path.join(out_dir, "monster_dragon_pawn.glb"))
    build_goblin_pawn(os.path.join(out_dir, "monster_goblin_pawn.glb"))
    build_skeleton_pawn(os.path.join(out_dir, "monster_skeleton_pawn.glb"))
    build_minotaur_pawn(os.path.join(out_dir, "monster_minotaur_pawn.glb"))
    build_hound_pawn(os.path.join(out_dir, "monster_hound_pawn.glb"))
    build_skirmisher_pawn(os.path.join(out_dir, "monster_skirmisher_pawn.glb"))

    # Weapon 3D Models
    build_weapon_sword_iron(os.path.join(out_dir, "weapon_sword_iron.glb"))
    build_weapon_sword_hero(os.path.join(out_dir, "weapon_sword_hero.glb"))
    build_weapon_club_wood(os.path.join(out_dir, "weapon_club_wood.glb"))
    build_weapon_staff_wizard(os.path.join(out_dir, "weapon_staff_wizard.glb"))
    build_weapon_bow_recurve(os.path.join(out_dir, "weapon_bow_recurve.glb"))
    build_weapon_dagger_rogue(os.path.join(out_dir, "weapon_dagger_rogue.glb"))
    build_weapon_bamboo_pole(os.path.join(out_dir, "weapon_bamboo_pole.glb"))
    build_weapon_greatsword(os.path.join(out_dir, "weapon_greatsword.glb"))
    build_weapon_warhammer(os.path.join(out_dir, "weapon_warhammer.glb"))
    build_weapon_mace_flanged(os.path.join(out_dir, "weapon_mace_flanged.glb"))
    build_weapon_rapier(os.path.join(out_dir, "weapon_rapier.glb"))
    build_weapon_spear(os.path.join(out_dir, "weapon_spear.glb"))
    build_weapon_crossbow(os.path.join(out_dir, "weapon_crossbow.glb"))
    build_weapon_battleaxe(os.path.join(out_dir, "weapon_battleaxe.glb"))

    # Armor, Shield & Helmet 3D Models
    build_armor_shield_heater(os.path.join(out_dir, "armor_shield_heater.glb"))
    build_armor_shield_round(os.path.join(out_dir, "armor_shield_round.glb"))
    build_armor_shield_tower(os.path.join(out_dir, "armor_shield_tower.glb"))
    build_armor_helm_knight(os.path.join(out_dir, "armor_helm_knight.glb"))
    build_armor_helm_iron(os.path.join(out_dir, "armor_helm_iron.glb"))
    build_armor_suit_plate(os.path.join(out_dir, "armor_suit_plate.glb"))
    build_armor_suit_leather(os.path.join(out_dir, "armor_suit_leather.glb"))
    build_armor_suit_chainmail(os.path.join(out_dir, "armor_suit_chainmail.glb"))

    # Spell VFX & Projectile 3D Models
    build_spell_fireball(os.path.join(out_dir, "spell_fireball_projectile.glb"))
    build_spell_magic_missile(os.path.join(out_dir, "spell_magic_missile_orb.glb"))
    build_spell_healing_glyph(os.path.join(out_dir, "spell_healing_glyph.glb"))
    build_spell_lightning_spark(os.path.join(out_dir, "spell_lightning_spark.glb"))
    build_spell_frost_shard(os.path.join(out_dir, "spell_frost_shard.glb"))
    build_spell_stinking_cloud_ring(os.path.join(out_dir, "spell_stinking_cloud_ring.glb"))

    print("✨ All 39 3D models generated successfully!")

