## NPCCharacterData — lookup table for all NPC character sprite frames.
## Source: characters-3.png (315×136), 20px cell stride, 16×16 content.
## Layout: 2 characters per row, 8 frames each: D1 D2 L1 L2 U1 U2 R1 R2
##   Char 1 → cols 0-7  (all 8 frames present)
##   Char 2 → cols 8-14 (7 frames; R2 at col 15 is beyond sheet edge = null)
## Sprite files: res://assets/sprites/npc/NNN_rROW_cCOL.png
class_name NPCCharacterData

const BASE_PATH := "res://assets/sprites/npc/"

## Frame layout mapping per character.
## "down"  → [D1, D2]   "left"  → [L1, L2]
## "up"    → [U1, U2]   "right" → [R1, R2] (R2 may be same as R1 if missing)
const CHARACTERS := {
"hero_no_sword": {
"display": "Hero (No Sword)",
"row": 0, "col": 0,
"down":  ["000_r0_c0.png", "001_r0_c1.png"],
"left":  ["002_r0_c2.png", "003_r0_c3.png"],
"up":    ["004_r0_c4.png", "005_r0_c5.png"],
"right": ["006_r0_c6.png", "007_r0_c7.png"],
},
"minister": {
"display": "Minister",
"row": 0, "col": 8,
"down":  ["008_r0_c8.png",  "009_r0_c9.png"],
"left":  ["010_r0_c10.png", "011_r0_c11.png"],
"up":    ["012_r0_c12.png", "013_r0_c13.png"],
"right": ["014_r0_c14.png", "014_r0_c14.png"],  # R2 missing, loop R1
},
"hero_sword": {
"display": "Hero (Sword)",
"row": 1, "col": 0,
"down":  ["015_r1_c0.png", "016_r1_c1.png"],
"left":  ["017_r1_c2.png", "018_r1_c3.png"],
"up":    ["019_r1_c4.png", "020_r1_c5.png"],
"right": ["021_r1_c6.png", "022_r1_c7.png"],
},
"lady": {
"display": "Lady",
"row": 1, "col": 8,
"down":  ["023_r1_c8.png",  "024_r1_c9.png"],
"left":  ["025_r1_c10.png", "026_r1_c11.png"],
"up":    ["027_r1_c12.png", "028_r1_c13.png"],
"right": ["029_r1_c14.png", "029_r1_c14.png"],
},
"hero_no_sword_shield": {
"display": "Hero (No Sword + Shield)",
"row": 2, "col": 0,
"down":  ["030_r2_c0.png", "031_r2_c1.png"],
"left":  ["032_r2_c2.png", "033_r2_c3.png"],
"up":    ["034_r2_c4.png", "035_r2_c5.png"],
"right": ["036_r2_c6.png", "037_r2_c7.png"],
},
"sage": {
"display": "Sage",
"row": 2, "col": 8,
"down":  ["038_r2_c8.png",  "039_r2_c9.png"],
"left":  ["040_r2_c10.png", "041_r2_c11.png"],
"up":    ["042_r2_c12.png", "043_r2_c13.png"],
"right": ["044_r2_c14.png", "044_r2_c14.png"],
},
"hero_sword_shield": {
"display": "Hero (Sword + Shield)",
"row": 3, "col": 0,
"down":  ["045_r3_c0.png", "046_r3_c1.png"],
"left":  ["047_r3_c2.png", "048_r3_c3.png"],
"up":    ["049_r3_c4.png", "050_r3_c5.png"],
"right": ["051_r3_c6.png", "052_r3_c7.png"],
},
"sage_alt": {
"display": "Sage (Alt)",
"row": 3, "col": 8,
"down":  ["053_r3_c8.png",  "054_r3_c9.png"],
"left":  ["055_r3_c10.png", "056_r3_c11.png"],
"up":    ["057_r3_c12.png", "058_r3_c13.png"],
"right": ["059_r3_c14.png", "059_r3_c14.png"],
},
"merchant": {
"display": "Merchant",
"row": 3, "col": 8,
"down":  ["053_r3_c8.png",  "054_r3_c9.png"],
"left":  ["055_r3_c10.png", "056_r3_c11.png"],
"up":    ["057_r3_c12.png", "058_r3_c13.png"],
"right": ["059_r3_c14.png", "059_r3_c14.png"],
},
"hero_sword_princess": {
"display": "Hero (Sword, with Princess)",
"row": 4, "col": 0,
"down":  ["060_r4_c0.png", "061_r4_c1.png"],
"left":  ["062_r4_c2.png", "063_r4_c3.png"],
"up":    ["064_r4_c4.png", "065_r4_c5.png"],
"right": ["066_r4_c6.png", "067_r4_c7.png"],
},
"red_guard": {
"display": "Red Guard",
"row": 4, "col": 8,
"down":  ["068_r4_c8.png",  "069_r4_c9.png"],
"left":  ["070_r4_c10.png", "071_r4_c11.png"],
"up":    ["072_r4_c12.png", "073_r4_c13.png"],
"right": ["074_r4_c14.png", "074_r4_c14.png"],
},
"princess": {
"display": "Princess",
"row": 5, "col": 0,
"down":  ["075_r5_c0.png", "076_r5_c1.png"],
"left":  ["077_r5_c2.png", "078_r5_c3.png"],
"up":    ["079_r5_c4.png", "080_r5_c5.png"],
"right": ["081_r5_c6.png", "082_r5_c7.png"],
},
"dragonlord": {
"display": "Dragonlord",
"row": 5, "col": 8,
"down":  ["083_r5_c8.png",  "084_r5_c9.png"],
"left":  ["085_r5_c10.png", "086_r5_c11.png"],
"up":    ["087_r5_c12.png", "088_r5_c13.png"],
"right": ["089_r5_c14.png", "089_r5_c14.png"],
},
"guard": {
"display": "Guard",
"row": 6, "col": 0,
"down":  ["090_r6_c0.png", "091_r6_c1.png"],
"left":  ["092_r6_c2.png", "093_r6_c3.png"],
"up":    ["094_r6_c4.png", "095_r6_c5.png"],
"right": ["096_r6_c6.png", "097_r6_c7.png"],
},
# Special partial row — only L-frames for trump_guard and D-frames for king
"trump_guard": {
"display": "Trump Guard",
"row": 6, "col": 8,
"down":  ["098_r6_c8.png",  "098_r6_c8.png"],  # no D frames, use L1
"left":  ["098_r6_c8.png",  "099_r6_c9.png"],
"up":    ["098_r6_c8.png",  "098_r6_c8.png"],
"right": ["098_r6_c8.png",  "098_r6_c8.png"],
},
"king": {
"display": "King",
"row": 6, "col": 10,
"down":  ["100_r6_c10.png", "101_r6_c11.png"],
"left":  ["100_r6_c10.png", "100_r6_c10.png"],
"up":    ["100_r6_c10.png", "100_r6_c10.png"],
"right": ["100_r6_c10.png", "100_r6_c10.png"],
},
}

## Return [frame0_path, frame1_path] for character_id + direction.
static func get_frames(character_id: String, direction: String = "down") -> Array:
	if not CHARACTERS.has(character_id):
		push_error("NPCCharacterData: unknown id '%s'" % character_id)
		return [BASE_PATH + "000_r0_c0.png", BASE_PATH + "000_r0_c0.png"]
	var ch: Dictionary = CHARACTERS[character_id]
	var dir: String = direction if ch.has(direction) else "down"
	var pair: Array = ch[dir]
	return [BASE_PATH + pair[0], BASE_PATH + pair[1]]

static func all_ids() -> Array:
	return CHARACTERS.keys()
