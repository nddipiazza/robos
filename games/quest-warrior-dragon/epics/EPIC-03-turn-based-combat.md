# EPIC-03: Turn-Based Combat System & Formulas Engine

## Overview
Build the specification-driven combat engine executing turn-based NES Quest: Warrior Dragon battle mechanics, monster AI routines, damage calculation formulas, and UI battle overlay.

---

## Data Specs
- `data/monsters.json` — Monster stats (HP, Str, Ag, Exp, Gold, Spells, Evasion).
- `data/spells.json` — Player and monster spell effects & MP costs.
- `data/combat_formulas.json` — NES combat algorithms (damage, hit chance, run chance).

---

## Parallelizable Task Cards

### TASK-03.1: Combat State Machine & Turn Execution
- **Owner**: Dev / AI Agent A
- **Files**: `src/systems/CombatEngine.gd`
- **Requirement**: Manage combat lifecycle: `INACTIVE` -> `PLAYER_TURN` -> `MONSTER_TURN` -> `VICTORY`/`DEFEAT`/`FLED`.
- **Acceptance Criteria**:
  - Player Attack, Spell, Item, Run commands update state cleanly.
  - Emits `EventBus.battle_message` and `EventBus.battle_ended`.

### TASK-03.2: Spell & Item Combat Action Evaluator
- **Owner**: Dev / AI Agent B
- **Files**: `src/systems/CombatEngine.gd`, `data/spells.json`
- **Requirement**: Execute player combat spells (`HURT`, `HEAL`, `SLEEP`, `STOPSPELL`) and items (`Herb`) during battle.
- **Acceptance Criteria**:
  - Deducts MP correctly.
  - Applies damage/healing according to spell specifications in `spells.json`.

### TASK-03.3: Battle Overlay UI & Monster Visual Renderer
- **Owner**: Dev / AI Agent C
- **Files**: `scenes/BattleOverlay.tscn`, `scripts/BattleOverlay.gd`
- **Requirement**: Render monster sprite, HP/MP status window, action menu, and text box dialogue driven by `EventBus` signals.
- **Acceptance Criteria**:
  - UI updates seamlessly when `CombatEngine` emits signals.
