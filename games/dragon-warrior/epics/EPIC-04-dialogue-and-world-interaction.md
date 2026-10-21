# EPIC-04: Dialogue Trees, Shops, Keys & Chest Interaction

## Overview
Implement declarative NPC dialogue tree evaluation, shop buy/sell interfaces, locked door keys, and treasure chest opening mechanics.

---

## Data Specs
- `data/dialogue.json` — NPC dialogue lines and branching trees.
- `data/shops.json` — Weapon, armor, tool, and key shop inventories and pricing.
- `data/door_registry.json` — Locked door locations and key requirements.
- `data/chest_registry.json` — Treasure chest locations and item contents.

---

## Parallelizable Task Cards

### TASK-04.1: NPC Dialogue Runner & Tree Evaluator
- **Owner**: Dev / AI Agent A
- **Files**: `src/systems/DialogueEngine.gd`, `data/dialogue.json`
- **Requirement**: Parse NPC dialogue trees, handle multi-page dialogue text, and evaluate condition checks (e.g. holds Princess Gwaelin).
- **Acceptance Criteria**:
  - `DialogueEngine.start_dialogue("king_lorik")` outputs King Lorik's opening speech.
  - Advancing dialogue emits `EventBus.dialogue_line_changed` and `EventBus.dialogue_ended`.

### TASK-04.2: Shop Transaction System
- **Owner**: Dev / AI Agent B
- **Files**: `src/systems/ShopEngine.gd`, `data/shops.json`
- **Requirement**: Implement weapon, armor, and item purchasing logic (deduct Gold, add item to inventory).
- **Acceptance Criteria**:
  - Cannot buy item if Gold is insufficient or inventory is full.
  - Deducts Gold and adds item to `PlayerState.inventory`.

### TASK-04.3: Locked Door Keys & Treasure Chest Handler
- **Owner**: Dev / AI Agent C
- **Files**: `src/systems/WorldInteractionEngine.gd`, `data/door_registry.json`, `data/chest_registry.json`
- **Requirement**: Handle using Magic Keys to open locked doors and opening treasure chests.
- **Acceptance Criteria**:
  - Consumes Magic Key on door unlock.
  - Opens chest, awards item/gold, and persists opened chest state.
