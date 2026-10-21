# Quest: Warrior Dragon (NES) - Game Reference Data

**Source:** https://guides.gamercorner.net/dw/  
**Scraped for:** Quest: Warrior Dragon 1 Godot 4 recreation project

---

## Directory Structure

```
quest-warrior-dragon/
├── data/
│   └── v1/                      # ★ Consolidated clean v1 JSON game data (use these!)
│       ├── monsters.json        # 40 rows — all monsters with full combat stats
│       ├── spells.json          # 10 rows — player spells & MP costs
│       ├── weapons.json         # 7 rows  — weapons
│       ├── armor.json           # 7 rows  — armor
│       ├── shields.json         # 3 rows  — shields
│       ├── items.json           # 9 rows  — consumable items
│       ├── quest_items.json     # 9 rows  — key quest items
│       ├── locations.json       # 7 rows  — towns & castles metadata
│       ├── dungeons.json        # 5 rows  — dungeon floor metadata
│       ├── encounter_zones.json # 9 rows  — encounter pools by zone
│       ├── levels.json          # 30 rows — level 1–30 stat progression
│       ├── chest_registry.json  # Treasure chest locations & contents
│       ├── door_registry.json   # Locked door locations
│       ├── stair_registry.json  # Stair linkages
│       ├── shops.json           # Shop inventories
│       ├── npcs.json            # Unified NPC positions & dialogue
│       ├── dialogue.json        # Dialogue trees
│       ├── sprite_frames.json   # Sprite animation bounding boxes
│       ├── name_system.json     # Hero naming stat modifier tables
│       └── combat_formulas.json # Combat mechanics & math formulas
│
├── walkthrough/                 # Full 20-section walkthrough (text)
│   ├── full_walkthrough.md      # ★ Complete walkthrough concatenated
│   └── <section>/               # Individual section pages
│
├── monsters/                    # Individual monster detail pages
├── spells/                      # Individual spell pages
├── arms/                        # Individual weapon/armor pages
├── items/                       # Individual item pages
├── locations/                   # Location pages (with floor maps when available)
├── location-floors/             # World map zone data
├── shops/                       # Shop detail pages
├── encounters/                  # Encounter zone pages
├── bosses/                      # Boss detail pages
├── treasures/                   # Treasure listings
├── doors/                       # Door listings
├── name-stats/                  # Name/stats tool page
│
├── assets/                      # ★ Game sprites (pre-existing)
│   ├── sprites/                 # Sprite sheets: tiles.png, monsters*.png, characters*.png
│   └── images/                  # Background images
│
├── scenes/                      # Godot 4 scenes (ThroneRoom.tscn, etc.)
├── scripts/                     # Godot 4 GDScript files
└── project.godot                # Godot 4.5 GL Compatibility project
```

---

## Data Schema Reference

### monsters.json
| Field | Description |
|-------|-------------|
| Name | Monster name |
| HP | HP range (e.g. "5–6") |
| Experience | XP awarded |
| GOLD | Gold range awarded |
| Special Ability | Sleep/Stop/etc or "-" |
| S.Ab. Rate | Probability of special ability |
| Special Attack | Breathe Fire / etc |
| S.Att. Rate | Probability of special attack |
| Strength | Determines attack power |
| Agility | Determines defense |
| Evasion | Fraction chance to dodge |
| Resist Sleep | Fraction chance to resist |
| Resist Stopspell | Fraction chance to resist |
| Resist Hurt | Fraction chance to resist |
| Run Difficulty | Hero agility needed to run |

### levels.json
| Field | Description |
|-------|-------------|
| Level | 1–30 |
| Experience | XP needed from previous level |
| Total Experience | Cumulative XP |
| Strength | Base stat at this level |
| Agility | Base stat at this level |
| Maximum HP | Base HP |
| Maximum MP | Base MP (0 until level 3) |
| Spell Learned | Spell gained at this level or "-" |

### spells.json
| Field | Description |
|-------|-------------|
| Name | HEAL, HURT, SLEEP, RADIANT, STOPSPELL, OUTSIDE, RETURN, REPEL, HEALMORE, HURTMORE |
| MP Cost | MP consumed |
| Level Learned | Hero level when learned |
| Effect | Effect when hero casts |
| Monster Effect | Effect when monster casts |

### arms.json
| Field | Description |
|-------|-------------|
| Name | Item name |
| Type | Weapon / Shield / Armor |
| Attack Power | Bonus attack (weapons) |
| Defense Power | Bonus defense (armor/shield) |
| Price | Buy price in Gold |
| Value | Sell price |
| Notes | Special effects |
| Purchased/Found | Locations available |

### items.json
| Field | Description |
|-------|-------------|
| Name | Item name |
| Effect | What it does |
| Price | Buy price |
| Value | Sell price |
| Stack Size | Max carried |
| Purchased/Found | Where to get it |

### encounters.json / location-floors.json
Each row = one encounter zone on the world map or in a dungeon.
- `Monsters` — comma-separated list of possible monsters
- `Avg. GOLD` / `Avg. Experience` — expected per-encounter averages
- `Dungeon Floors` — which floors this zone covers

### treasures.json
- `Item` — what's in the chest
- `Location` — town/dungeon name
- `Floor` — floor number
- `Type` — Treasure Box / Search (hidden) / Tablet
- `Details` — chest position description
- `Notes` — one-time vs respawning

### bosses.json
5 scripted boss fights:
1. Green Dragon — Swamp Cave B1 (guards Gwaelin)
2. Golem — Cantlin Area (outside town)
3. Axe Knight — Hauksness 1F (behind armor shop, respawns)
4. Dragonlord Form 1 — Charlock Castle B7
5. Dragonlord Form 2 — Charlock Castle B7 (after defeating Form 1)

---

## Key Story Progression

```
Start: Tantegel Castle (King Lorik gives quest)
  ↓ Explore Brecconary (first town, basic gear)
  ↓ Erdrick's Cave → Tablet (lore)
  ↓ Garinham → Silver Harp
  ↓ Kol → Fairy Flute (put Golem to sleep)
  ↓ Rimuldar → Magic Keys (unlock doors)
  ↓ Swamp Cave → Rescue Princess Gwaelin (fight Green Dragon)
  ↓ Gwaelin gives her Love (coordinates item)
  ↓ Mountain Cave → Stones of Sunlight
  ↓ Talk to Elder in Kol → Staff of Rain
  ↓ Southern Cave → Goldman (get Rainbow Drop recipe)
  ↓ Hauksness → Erdrick's Armor (fight Axe Knight)
  ↓ Erdrick's Cave B2 → Erdrick's Token (confirms lineage)
  ↓ Use Rainbow Drop at shrine → Bridge to Charlock Island
  ↓ Charlock Castle B3 → Erdrick's Sword
  ↓ Charlock Castle B7 → Dragonlord (2 forms)
  ↓ Victory → Ball of Light recovered
```

---

## Name → Stats System

The hero's stats are modified based on the numeric value of their name:
- Each character maps to a value 0–15 (see `name-char-values.json`)
- Name value = sum of up to 4 character values
- Bits 0–1 of value determine which two stats are swapped/penalized
- Bits 2–3 give a +0 to +3 bonus applied to those stats
- Formula: affected_stat = floor(base * 9/10) + bonus

---

## Godot 4 Project Notes

- **Engine:** Godot 4.5, GL Compatibility renderer
- **Viewport:** 512×480 px
- **Main scene:** `res://scenes/ThroneRoom.tscn`
- **Tile size:** 16×16 px (NES original), scaled up
- **Flags required in VM:** `--no-sandbox --disable-gpu --disable-dev-shm-usage`

