# EPIC-05: Character Progression, Level Up & Save System

## Overview
Implement NES Dragon Warrior stat growth lookup tables, name-derived initial stat algorithms, spell unlocks, and save state persistence across play sessions.

---

## Data Specs
- `data/levels.json` — Stat progression per level (1–30: XP, HP, MP, Str, Ag, Spells).
- `data/name_system.json` — Hero name character-to-value calculation table.

---

## Parallelizable Task Cards

### TASK-05.1: Name-Derived Hero Initial Stats System
- **Owner**: Dev / AI Agent A
- **Files**: `src/systems/ProgressionEngine.gd`, `data/name_system.json`
- **Requirement**: Calculate base Strength, Agility, HP, MP growth curve variant based on hero's initial name string.
- **Acceptance Criteria**:
  - Name calculation matches NES algorithm (mod 16 sum of character values).

### TASK-05.2: Level Up & XP Evaluation System
- **Owner**: Dev / AI Agent B
- **Files**: `src/systems/ProgressionEngine.gd`, `data/levels.json`
- **Requirement**: Compare total XP after battle against `levels.json` thresholds, trigger level up, boost stats, and unlock spells.
- **Acceptance Criteria**:
  - Reaching required XP triggers `EventBus.level_up(level, hp_gain, mp_gain, spell_learned)`.
  - Unlocked spell added to player spell list.

### TASK-05.3: Save State Persistence Engine
- **Owner**: Dev / AI Agent C
- **Files**: `src/systems/SaveSystem.gd`, `src/systems/PlayerState.gd`
- **Requirement**: Save player state to local JSON file (`user://save_slot_1.json`) and restore state on load.
- **Acceptance Criteria**:
  - Hero stats, equipment, inventory, map location, and quest flags restored perfectly on load.
