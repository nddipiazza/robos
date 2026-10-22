"""
Generate assets/maps/worldmap_terrain.png + .json from dw1-over2.png.
Each pixel in the output = one 16x16 tile on the overworld.
Run after any change to the map image.
"""
from PIL import Image
import json, os

BASE    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_PNG = os.path.join(BASE, "assets/maps/dw1-over2.png")
OUT_PNG = os.path.join(BASE, "assets/maps/worldmap_terrain.png")
OUT_JSON= os.path.join(BASE, "assets/maps/worldmap_terrain.json")

img     = Image.open(SRC_PNG).convert("RGB")
TILE_PX = 16
TILES   = 124  # 1984 / 16

# Terrain IDs  (must match WorldMap.gd BLOCKED_TERRAIN / RoutePlanner.BLOCKED_WORLD_TERRAIN)
# 0=water  1=forest_dk  2=forest_md  3=grass  4=plains
# 5=desert 6=mountain   7=swamp      8=hills  9=wall (impassable)

# Charlock Castle (50,50) is ringed by poisonous swamp (2 HP per step without Erdrick's Armor).
CHARLOCK = (50, 50)
CHARLOCK_SWAMP_TILES = {
    (x, y) for x in range(49, 52) for y in range(49, 52) if (x, y) != CHARLOCK
}
# Cantlin's wall ring: the only way in is the grass gate tile at (75,102), guarded by the Golem.
CANTLIN_GATE = (75, 102)
CANTLIN_WALL_TILES = {
    (x, y)
    for x in range(73, 78)
    for y in range(102, 107)
    if (x in (73, 77) or y in (102, 106)) and (x, y) != CANTLIN_GATE
}
def classify(r, g, b) -> int:
    if b > 150 and b > g * 1.3 and b > r * 5:      return 0  # water
    if r < 10  and g < 50  and b < 20:              return 1  # forest dark
    if r < 20  and g < 90  and b < 20:              return 2  # forest medium
    if r > 160 and g > 160 and b > 100:             return 5  # desert / beach
    if abs(r-g) < 20 and abs(g-b) < 20 and 60 < r < 180: return 6  # mountain
    if abs(g-b) < 30 and g > r * 1.2 and b > 60:   return 7  # swamp
    if g > 200 and g > r * 1.2 and b < 50:         return 4  # plains (bright green)
    if r > 140 and g > 170 and b < 100:             return 8  # hills (olive)
    if g > 100 and g > r * 1.1 and b < 80:         return 3  # grass
    return 3

TERRAIN_COLORS = {
    0: (7,   120, 251, 255),
    1: (0,   20,  0,   255),
    2: (0,   55,  0,   255),
    3: (100, 200, 0,   255),
    4: (160, 240, 10,  255),
    5: (220, 205, 145, 255),
    6: (125, 127, 131, 255),
    7: (80,  140, 130, 255),
    8: (197, 227, 71,  255),
    9: (150, 94,  58,  255),
}

out  = Image.new("RGBA", (TILES, TILES))
grid = []
for ty in range(TILES):
    row = []
    for tx in range(TILES):
        cx = tx * TILE_PX + TILE_PX // 2
        cy = ty * TILE_PX + TILE_PX // 2
        if (tx, ty) in CANTLIN_WALL_TILES:
            t = 9
        elif (tx, ty) in CHARLOCK_SWAMP_TILES:
            t = 7
        else:
            t = classify(*img.getpixel((cx, cy)))
        row.append(t)
        out.putpixel((tx, ty), TERRAIN_COLORS[t])
    grid.append(row)

out.save(OUT_PNG)
with open(OUT_JSON, "w") as f:
    json.dump({"tiles": TILES, "terrain": grid}, f)

from collections import Counter
NAMES = {0:"water",1:"forest_dk",2:"forest_md",3:"grass",4:"plains",5:"desert",6:"mountain",7:"swamp",8:"hills"}
flat  = [t for row in grid for t in row]
for tid, cnt in sorted(Counter(flat).items()):
    walk = tid not in (0, 6)
    print(f"  {tid} {NAMES[tid]:12} {cnt:5} tiles  {'walk' if walk else 'BLOCK'}")
print(f"\n✓ {OUT_PNG}")
print(f"✓ {OUT_JSON}")
