# 🐉 Dragon Warrior (NES) — Master Project Roadmap & Remaining TODOs

This document is the comprehensive, canonical tracker of all remaining work required to bring the **Dragon Warrior (NES)** recreation in Godot 4 from its current playable prototype to a **100% complete, authentic, and winnable game**.

---

## 📊 Summary of Current State vs. Target Parity

| System / Feature Area | Current Status | Parity Gap / Remaining Work |
| :--- | :---: | :--- |
| **Overworld & World Map** | 🟡 90% | Missing Staff of Rain Cave & Southern Shrine transitions; Swamp/Barrier damage calculation; step HP regen. |
| **Dungeon Floors (20+ Maps)** | 🟡 85% | 2 missing Shrines (`StaffOfRainCave`, `RainbowDropCave`); full chest/door audit against registry. |
| **Combat Engine** | 🟡 80% | Level-up trigger on victory is missing; critical hit & evasion formulas tuning; full spell interaction audit. |
| **Character Progression & Stats** | 🔴 35% | Level-up stat bump (`levels.json`), spell unlocking on level threshold, and name-derived growth curves missing. |
| **Spells System (Combat & Field)** | 🟡 60% | Overworld/Field spell menu (`HEAL`, `OUTSIDE`, `RETURN`, `REPEL`, `HEALMORE`); `BattleOverlay` spell resist polish. |
| **Items & Equipment Engine** | 🟡 55% | Field item use (`Herb`, `Fairy Water`, `Wings`, `Flute`, `Harp`, `Gwaelin's Love`, `Cursed Items`); Armor/Shield stat wiring. |
| **Towns, Shops & Inns** | 🟢 90% | Buy/sell flow works; needs selling of current equipped arm upon new purchase and Inn recovery jingles. |
| **NPCs & Dialogue** | 🟡 80% | Dialogue present in major towns; condition-based dialogue branches (Princess rescued, King Lorik save) need completion. |
| **Story Quests & Key Triggers** | 🔴 30% | Cantlin Golem, Swamp Dragon & Princess Gwaelin escort, Hauksness Axe Knight, Rainbow Bridge & Dragonlord battle/epilogue. |
| **Save / Load & Death System** | 🟡 50% | Fixture loading & disk saves work; in-game King Lorik save action, character naming screen, and Death penalty loop needed. |
| **Audio, SFX & Visual Polish** | 🟡 75% | BGM library exists; SFX hooked for some actions; needs level-up fanfare, death fanfare, cursed sound, and flute jingle. |
| **Automated E2E Test Suite** | 🟡 65% | Smoke features and town tests active; needs end-to-end full walkthrough test features. |

---

## 📋 Epic Breakdown & Actionable Task Cards

---

### 🌟 Phase 1: Core Progression & Progression Loop (Highest Priority)
*Without these systems, the hero cannot level up, gain stats, or learn spells needed to progress beyond starting areas.*

- [ ] **1.1. Level-Up Evaluation on Battle Victory**
  - **Location**: `scripts/BattleOverlay.gd`, `src/systems/ProgressionEngine.gd`, `src/systems/PlayerState.gd`
  - **Details**:
    - When monster XP is awarded in `_after_player_act()`, check `data/v1/levels.json` against current `hero_stats["exp"]`.
    - If total XP meets or exceeds the next level requirement:
      - Increment `hero_stats["level"]`.
      - Calculate gains for `hp_max`, `mp_max`, `str`, `agl`, `atk`, `def` from `levels.json`.
      - Boost current `hp` and `mp` by the gained amounts.
      - Play level-up sound effect (`assets/music/mp3/level_up.mp3`).
      - Display multi-page victory dialog: `"Courage and wit have served thee well. Thou hast been promoted to Level X! Thy Strength increases by Y... Thy Maximum HP increases by Z..."`
      - If a spell is learned at this level (Levels 3, 4, 7, 9, 10, 12, 15, 17, 19), append spell ID to `GameState.spells` and announce: `"Thou hast learned the spell of [SPELL]!"`
      - Handle multiple level-ups in a single fight if massive XP is earned (e.g. Metal Slime).

- [ ] **1.2. Equipment Stat Modifiers & Dynamic Recalculation**
  - **Location**: `scripts/GameState.gd`, `src/systems/PlayerState.gd`, `scripts/DungeonMap.gd`, `scripts/Castle1F.gd`, `scripts/WorldMap.gd`
  - **Details**:
    - Implement formulas:
      $$\text{ATK} = \text{STR} + \text{Weapon Attack}$$
      $$\text{DEF} = \lfloor \text{AGL} / 2 \rfloor + \text{Armor Defense} + \text{Shield Defense} + (\text{Dragon's Scale } ?\ 2 : 0)$$
    - When equipping or unequipping items in `_use_item()` or buying in shops, update `hero_stats["atk"]` and `hero_stats["def"]` immediately.
    - Support Shields explicitly in `GameState` (`var shield: String = ""`) alongside `weapon` and `armor`.

- [ ] **1.3. NES Name-Derived Hero Growth Curves**
  - **Location**: `src/systems/ProgressionEngine.gd`, `data/v1/name_system.json`
  - **Details**:
    - Implement original NES formula based on the sum of character index values $\bmod 16$.
    - Determine which of the 4 stat growth paths the hero follows (Strength-favored, Agility-favored, HP-favored, or MP-favored).

- [ ] **1.4. Interactive Character Creation & Save Slot UI**
  - **Location**: `scenes/SaveSelect.tscn`, `scripts/SaveSelect.gd`
  - **Details**:
    - Add retro NES Name Entry screen with character matrix (A–Z, space, hyphen, backspace, end).
    - Allow choosing between 3 Adventure Log save slots.
    - Allow selecting Message Speed (Fast, Normal, Slow).

---

### 🔮 Phase 2: Complete Spells & Field Casting System
*Enables the hero to cast utility and healing spells outside of combat as well as in battle.*

- [ ] **2.1. Overworld & Field Spell Menu**
  - **Location**: `scripts/WorldMap.gd`, `scripts/DungeonMap.gd`, `scripts/Castle1F.gd`
  - **Details**:
    - Replace hardcoded stub in `_cmd_spell()` with an interactive submenu listing `GameState.spells`.
    - **`HEAL` (4 MP)**: Restores 10–17 HP; plays heal SFX; updates HP bar.
    - **`HEALMORE` (10 MP)**: Restores 85–100 HP; plays heal SFX; updates HP bar.
    - **`RADIANT` (3 MP)**: Illuminates dark dungeon floor for 200 steps with gradual radius decay (already implemented in `DungeonMap.gd`, hook into field spell menu).
    - **`OUTSIDE` (6 MP)**: Warps player from any dungeon floor directly to its world map entrance tile.
    - **`RETURN` (8 MP)**: Warps player from overworld/dungeon directly to Tantegel Castle entrance tile `(45, 45)`.
    - **`REPEL` (2 MP)**: Prevents random encounters against monsters weaker than hero for 128 overworld steps.
    - In battle, prohibit field-only spells (`RADIANT`, `OUTSIDE`, `RETURN`, `REPEL`) with `"Cannot be used in battle."`

- [ ] **2.2. Battle Spell Mechanics & Enemy AI Polish**
  - **Location**: `scripts/BattleOverlay.gd`, `data/v1/spells.json`
  - **Details**:
    - Ensure all 10 spells have full animations and accurate formulas:
      - `HURT`: 5–12 damage.
      - `HURTMORE`: 58–65 damage.
      - `SLEEP`: Enemy sleep status (1/3 chance enemy wakes each turn).
      - `STOPSPELL`: Enemy spell blocking.
    - Validate enemy spell resistance checks against `resist_sleep` and `resist_stopspell` in `monsters.json`.
    - Verify Erdrick's Armor protects against enemy `STOPSPELL` and reduces `HURT`/`HURTMORE`/fire damage by 1/3.

---

### 🎒 Phase 3: Consumables, Key Items & Equipment Effects
*Wires all item handlers so that inventory items have authentic, functional behavior.*

- [ ] **3.1. Field Consumables & Exploration Tools**
  - **Location**: `scripts/WorldMap.gd`, `scripts/DungeonMap.gd`, `scripts/Castle1F.gd`
  - **Details**:
    - **`Herb` / `Medical Herb`**: Use from ITEM menu restores 23–30 HP, consumes 1 Herb.
    - **`Torch`**: Lights dungeon radius (already in `DungeonMap.gd`, ensure consistency in all indoor/cave scenes).
    - **`Fairy Water`**: Sets repel step counter to 128 steps on WorldMap; prevents weaker monster encounters.
    - **`Wings` / `Wings of the Wyvern`**: Warps Hero to Tantegel Castle on WorldMap `(45, 45)`.
    - **`Dragon's Scale`**: Equipping/using provides permanent/active +2 Defense bonus.
    - **`Fighter's Ring`**: Equippable accessory; unlocks special dialogue response in Rimuldar.
    - **`Magic Key`**: Stackable up to 6 in a single slot; opens locked doors across maps; consumed on use.

- [ ] **3.2. Quest Items & Interactive Artifacts**
  - **Location**: `scripts/WorldMap.gd`, `scripts/DungeonMap.gd`, `scripts/BattleOverlay.gd`
  - **Details**:
    - **`Fairy Flute`**:
      - On WorldMap/Towns: Plays soothing flute melody SFX (`assets/music/mp3/fairy_flute.mp3`).
      - In Battle vs. **Golem**: Puts Golem to sleep 100% of the time (ignoring normal sleep resistance).
    - **`Silver Harp`**:
      - On WorldMap/Dungeon: Playing the harp immediately triggers an overworld monster battle.
      - Quest turn-in: Give to Sage in Northern Shrine to receive `Staff of Rain`.
    - **`Gwaelin's Love`**:
      - Using the item displays: `"Princess Gwaelin: 'From Tantegel Castle thou art X tiles to the North/South and Y tiles to the East/West. To reach the next level thou must earn Z experience points.'"`
    - **`Rainbow Drop`**:
      - Using at tile `(66, 51)` on `WorldMap.gd` triggers rainbow bridge construction animation and sets `bridge_built = true`.
    - **`Cursed Belt` & `Death Necklace`**:
      - Equipping plays cursed sound effect (`assets/music/mp3/cursed.mp3`).
      - Cursed hero cannot enter Tantegel Castle Throne Room (King turns player away: `"Thou art cursed! Begone!"`).
      - Must visit Tantegel Castle curse removal sage to lift curse and destroy item.

- [ ] **3.3. Special Armor Environmental Perks**
  - **Location**: `scripts/WorldMap.gd`, `scripts/DungeonMap.gd`, `scripts/Castle1F.gd`
  - **Details**:
    - **`Magic Armor`**: Restores +1 HP for every 4 steps walked. Reduces magic damage by 1/3 in battle.
    - **`Erdrick's Armor`**:
      - Restores +1 HP for every 1 step walked.
      - Immunity to swamp tile damage (-2 HP) and barrier tile damage (-15 HP).
      - Immunity to enemy `STOPSPELL` in battle.
      - Reduces magic & dragon breath damage by 1/3.

---

### 🗺️ Phase 4: Missing Map Scenes & Dungeon Integration
*Completes all physical locations in Alefgard and ensures seamless stair and chest connections.*

- [ ] **4.1. Northern Shrine (Staff of Rain Shrine)**
  - **Create**: `scenes/StaffOfRainCave.tscn`, `scripts/StaffOfRainCave.gd`
  - **Details**:
    - Accessible via stairs on WorldMap at `(83, 3)`.
    - Sage NPC dialogue:
      - If player has `Silver Harp`: Takes harp and gives `Staff of Rain` (`"Thou hast brought the Silver Harp! Take now the Staff of Rain."`).
      - If player does not have harp: `"Bring to me the Silver Harp, and I shall bestow upon thee the Staff of Rain."`
      - If already received: `"Go forth, descendant of Erdrick."`

- [ ] **4.2. Southern Shrine (Holy Sanctum / Rainbow Drop Shrine)**
  - **Create**: `scenes/RainbowDropCave.tscn`, `scripts/RainbowDropCave.gd`
  - **Details**:
    - Accessible via stairs on WorldMap at `(110, 111)`.
    - Sage NPC dialogue & item combination:
      - Checks if player possesses `Staff of Rain`, `Stones of Sunlight`, and `Erdrick's Token`.
      - If all 3 present: Takes `Staff of Rain` and `Stones of Sunlight`, gives `Rainbow Drop` (`"Thou hast proven thy lineage! In the name of the ancients, take the Rainbow Drop!"`).
      - If items missing: Tells hero what proof is still required.

- [ ] **4.3. Full Dungeon Floor & Stair Linkage Audit**
  - **Audit & Verify**:
    - `ErdricksCaveB1` ↔ `ErdricksCaveB2` (Erdrick's Tablet inspection).
    - `MountainCaveB1` ↔ `MountainCaveB2` (Fighter's Ring, Death Necklace, gold chests).
    - `GarinhamB1` ↔ `B2` ↔ `B3` ↔ `B4` (Silver Harp chest on B4; Cursed Belt on B3; hidden entrance behind northern wall).
    - `SwampCave` (North entrance `(106, 46)`, South entrance `(106, 51)`, Green Dragon boss tile, Princess cell).
    - `CharlockCastle1F` ↔ `B1` ↔ `B2` ↔ `B3` ↔ `B4` ↔ `B5` ↔ `B6` ↔ `CharlockThroneRoom` (Erdrick's Sword chest on B2 via B4 loop; hidden stairs behind throne on 1F).

- [ ] **4.4. Treasure Chest Registry & Loot Persistence**
  - **Location**: `scripts/DungeonMap.gd`, `scripts/Castle1F.gd`, `data/v1/chest_registry.json`
  - **Details**:
    - Verify all chests in `data/v1/chest_registry.json` match in-game coordinates.
    - Ensure opened chests persist in `GameState.opened_chests` across all scene transitions and save states.

---

### ⚔️ Phase 5: Story Quests, Boss Battles & Princess Escort
*Implements the critical story encounters and the rescue sequence.*

- [ ] **5.1. Cantlin Golem Boss Encounter**
  - **Location**: `scripts/WorldMap.gd` / `scripts/Cantlin.gd`
  - **Details**:
    - Stepping on Cantlin entrance tile triggers boss battle against `golem` if `GameState.golem_defeated == false`.
    - Using `Fairy Flute` in combat guarantees putting Golem to sleep.
    - Defeating Golem sets `golem_defeated = true`, permanently granting free access to Cantlin.

- [ ] **5.2. Swamp Cave Green Dragon Boss & Princess Rescue**
  - **Location**: `scripts/SwampCave.gd`
  - **Details**:
    - Fixed encounter on tile guarding the cell door against `green_dragon`.
    - After defeating the dragon, player can unlock door with Magic Key and talk to Princess Gwaelin (`"Forever and ever I have waited for thee, ERDRICK!"`).
    - Princess Gwaelin joins player party:
      - Set `GameState.carrying_princess = true`.
      - Update hero sprite texture to `hero_sword_princess` / `hero_no_sword_princess`.
      - Special dialogue if hero stays at an Inn while carrying Princess (`"Thou hast had a good night's rest!"`).
    - Returning to King Lorik in `ThroneRoom.gd`:
      - King thanks hero: `"ERDRICK, thou hast saved Princess Gwaelin! I reward thee with Gwaelin's Love."`
      - Princess Gwaelin moves to throne next to King.
      - Sets `GameState.saved_princess = true`, `carrying_princess = false`, and gives `Gwaelin's Love`.

- [ ] **5.3. Hauksness Ruins, Axe Knight & Erdrick's Armor**
  - **Location**: `scripts/Hauksness.gd`
  - **Details**:
    - Stepping on tree tile behind Wynn's shop `(18, 12)` triggers boss battle with `axe_knight` if not defeated.
    - Once defeated, `SEARCH` command on that exact tile awards `Erdrick's Armor` to `GameState.armor` and equips it.

- [ ] **5.4. Erdrick's Token in Southern Swamp**
  - **Location**: `scripts/WorldMap.gd`
  - **Details**:
    - Performing `SEARCH` at tile `(85, 114)` in the eastern swamp awards `Erdrick's Token`.

- [ ] **5.5. Dragonlord Final Boss Sequence & Dialogue Branch**
  - **Location**: `scripts/CharlockThroneRoom.gd`, `scripts/BattleOverlay.gd`
  - **Details**:
    - Speaking to Dragonlord presents branching choice:
      - `"Didst thou come to join me? If thou dost, half the world shall be thine."`
      - **YES**: Screen fades to black, red text: `"Then half of the world is thine... The world falls into eternal darkness."` -> Game Over.
      - **NO**: Triggers battle with `dragonlord_form1`.
    - Form 1 defeat triggers transformation sequence into `dragonlord_form2` (giant dragon).
    - Defeating Form 2 triggers victory sequence: reclaim the Ball of Light!

---

### 👑 Phase 6: Win Condition, Epilogue & Ending Sequence
*Brings the game to a glorious conclusion after the Dragonlord's defeat.*

- [ ] **6.1. Reclaiming the Light of Alefgard**
  - **Location**: `scripts/GameState.gd`, `scripts/WorldMap.gd`
  - **Details**:
    - Defeating Dragonlord sets `GameState.dragonlord_defeated = true`.
    - Overworld music switches to peaceful/triumphant theme (`assets/music/mp3/my_glorious_kingdom.mp3` / `assets/music/mp3/charlock_cleansed.mp3`).
    - All monster random encounters disabled across Alefgard.
    - All dungeon darkness removed.

- [ ] **6.2. Free Victory Lap Across Alefgard**
  - **Location**: `scripts/Brecconary.gd`, `scripts/Kol.gd`, `scripts/Garinham.gd`, `scripts/Rimuldar.gd`, `scripts/Cantlin.gd`, `scripts/Castle1F.gd`
  - **Details**:
    - NPCs across all towns and castle floors update their dialogue to celebrate the hero's victory (`"Peace has returned to Alefgard!"`, `"Long live ERDRICK!"`).

- [ ] **6.3. Throne Room Return & Ending Ceremony**
  - **Location**: `scripts/ThroneRoom.gd`
  - **Details**:
    - King Lorik congratulates Hero and offers the throne of Alefgard: `"I yield my throne to thee!"`
    - Hero speech: `"If there is a land that I must rule, I must find it myself."`
    - If Princess Gwaelin was rescued, she runs up: `"Wait! Wilt thou take me with thee?"` (Choice: YES/NO).
    - Hero and Princess depart castle to the applause of guards.

- [ ] **6.4. NES Staff Roll & Credits Screen**
  - **Create**: `scenes/CreditsScreen.tscn`, `scripts/CreditsScreen.gd`
  - **Details**:
    - Display scrolling NES credits over sunset backdrop.
    - Play ending credits theme (`assets/music/mp3/dragon_quest_1_credits.mp3`).
    - Final screen: `"THE END"`.

---

### 💾 Phase 7: Save/Load Completeness & Death Mechanics
*Ensures the player can save, load, and recover from defeat authentic to the NES original.*

- [ ] **7.1. King Lorik Save Game Flow (Imperial Scroll of Honor)**
  - **Location**: `scripts/ThroneRoom.gd`, `scripts/GameState.gd`
  - **Details**:
    - Talking to King Lorik provides option: `"Dost thou wish to record thy deeds upon the Imperial Scrolls of Honor?"`
    - If YES: Serializes current `GameState` to `user://saves/save_slot_X.json`, plays save fanfare (`assets/music/mp3/king_lorik_save.mp3`), and announces: `"Thy deeds have been inscribed."`
    - Also tells Hero how many XP points are needed to reach the next level.

- [ ] **7.2. Death & Revival Penalty Loop**
  - **Location**: `scripts/BattleOverlay.gd`, `scripts/GameState.gd`, `scripts/ThroneRoom.gd`
  - **Details**:
    - Defeat in battle triggers death fanfare (`assets/music/mp3/thou_hast_died.mp3`).
    - Hero respawns in `ThroneRoom.tscn` in front of King Lorik.
    - **Penalties**:
      - Current gold is halved: `gold = int(gold / 2)`.
      - HP and MP restored to `hp_max` and `mp_max`.
      - King Lorik speech: `"Thou hast died. To die is a great shame. Go forth again, ERDRICK!"`

---

### 🔊 Phase 8: Audio, Environmental FX & Visual Polish
*Adds the atmospheric details that make the recreation feel indistinguishable from the NES classic.*

- [ ] **8.1. Sound Effects Coverage Pass**
  - **Audit & Wire**:
    - [ ] Wall bump thump (`assets/music/mp3/hit_wall.mp3` or synthesized NES bump).
    - [ ] Locked door opening chime.
    - [ ] Chest opening sound.
    - [ ] Stairs climbing / descending SFX.
    - [ ] Critical hit sound in battle.
    - [ ] Run away SFX in battle.
    - [ ] Cursed sound when equipping cursed items.
    - [ ] Flute melody when playing Fairy Flute.
    - [ ] King Lorik Imperial Scroll save fanfare.
    - [ ] Inn overnight rest fanfare (`assets/music/mp3/inn.mp3`).

- [ ] **8.2. Environmental Hazard & Step Damage**
  - **Location**: `scripts/WorldMap.gd`, `scripts/DungeonMap.gd`, `scripts/Castle1F.gd`
  - **Details**:
    - Stepping on Swamp tile: deals 2 damage per step (unless Erdrick's Armor equipped); screen flashes yellow/green.
    - Stepping on Barrier/Forcefield tile: deals 15 damage per step (unless Erdrick's Armor equipped); screen flashes red.
    - Magic Armor step counter: regenerates 1 HP every 4 steps.
    - Erdrick's Armor step counter: regenerates 1 HP every 1 step.

- [ ] **8.3. Town Covered Buildings & Roof Tile Rendering**
  - **Location**: `scripts/DungeonMap.gd`, `scripts/Brecconary.gd`, `scripts/Cantlin.gd`, `scripts/Rimuldar.gd`
  - **Details**:
    - Ensure covered interior roofs render as opaque ceilings when outside and reveal interior when entering doorway.

---

### 🧪 Phase 9: End-to-End Automated Testing & Release Presets
*Ensures every single stage of the game is covered by automated verification.*

- [ ] **9.1. Full Playthrough Cucumber Features**
  - **Create / Expand in `tests/e2e/features/`**:
    - `e2e_01_throne_room_to_brecconary.feature`
    - `e2e_02_erdricks_cave_tablet.feature`
    - `e2e_03_kol_village_and_fairy_flute.feature`
    - `e2e_04_rimuldar_keys_and_magic_armor.feature`
    - `e2e_05_tantegel_basement_stones_of_sunlight.feature`
    - `e2e_06_garins_grave_silver_harp.feature`
    - `e2e_07_staff_of_rain_exchange.feature`
    - `e2e_08_swamp_cave_green_dragon_and_princess.feature`
    - `e2e_09_cantlin_golem_and_flute.feature`
    - `e2e_10_hauksness_axe_knight_and_erdricks_armor.feature`
    - `e2e_11_erdricks_token_and_rainbow_drop.feature`
    - `e2e_12_charlock_castle_erdricks_sword.feature`
    - `e2e_13_dragonlord_battle_and_ending.feature`

- [ ] **9.2. Build & Export Profiles**
  - Configure Godot export presets:
    - Linux / X11 (`.x86_64`)
    - Windows Desktop (`.exe`)
    - Web / HTML5 (`.html` + WebAssembly)

---

## 🎯 Recommended Next Immediate Sprints

1. **Sprint 1 (Progression & Combat)**: Implement Phase 1 (Level up on victory, stat growth from `levels.json`, spell unlocks) + Phase 2.1 (Overworld HEAL, OUTSIDE, RETURN, REPEL spell casting).
2. **Sprint 2 (Items & Missing Shrines)**: Implement Phase 3 (Consumables, Fairy Water, Flute, Harp, Wings) + Phase 4 (Create `StaffOfRainCave.tscn` and `RainbowDropCave.tscn`).
3. **Sprint 3 (Bosses & Quests)**: Implement Phase 5 (Cantlin Golem, Swamp Green Dragon & Princess escort, Hauksness Axe Knight, Dragonlord dialogue & battle forms).
4. **Sprint 4 (Ending & Polish)**: Implement Phase 6 (Epilogue & Credits) + Phase 7 (Save/Death loop) + Phase 8 (SFX/Hazard polish).
