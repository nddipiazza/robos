# EPIC-01: Core Specification Architecture & Event Pipeline

## Overview
Establish the foundational specification engine, data repositories, signal broker (`EventBus`), and state serialization model for AI Dragon Warrior v2.

---

## System Contracts & Specifications

### 1. Data Schema Loading
- **Input**: Clean JSON files located in `res://data/v1/` (`monsters.json`, `spells.json`, `items.json`, `levels.json`, `locations.json`, etc.)
- **Contract**: `DataManager` loads and indexes all data into typed memory dictionaries at game startup. Emits `EventBus.data_loaded`.

### 2. Event Bus Broker
- **Location**: `src/core/EventBus.gd`
- **Contract**: Central decoupled signal bus for system notifications. No direct subsystem coupling.

---

## Parallelizable Task Cards

### TASK-01.1: Data Schema Validator & Spec Parser
- **Owner**: Core Dev / AI Agent A
- **Files**: `src/systems/DataManager.gd`, `tools/validate_v1_schemas.py`
- **Requirement**: Implement JSON parsing, schema lookup functions, and dictionary indexing for all v1 game specification datasets.
- **Acceptance Criteria**:
  - All JSON files loaded without runtime errors.
  - `DataManager.get_monster("slime")` returns valid stat dictionary.
  - Headless test `python3 tools/validate_v1_schemas.py` passes cleanly.

### TASK-01.2: Event Bus Signal Wiring & Logging
- **Owner**: Core Dev / AI Agent B
- **Files**: `src/core/EventBus.gd`
- **Requirement**: Define all system signals (`map_changed`, `battle_started`, `dialogue_started`, `player_stats_changed`, `game_saved`).
- **Acceptance Criteria**:
  - System components connect to `EventBus` signals.
  - Zero direct hardcoded calls between `CombatEngine` and `DialogueEngine`.

### TASK-01.3: PlayerState Container & Serialization System
- **Owner**: Core Dev / AI Agent C
- **Files**: `src/systems/PlayerState.gd`
- **Requirement**: Track hero stats, inventory, equipment, position, and provide `serialize()` / `deserialize()` functions.
- **Acceptance Criteria**:
  - `serialize()` returns complete JSON-compatible Dictionary.
  - `deserialize(dict)` restores player state accurately.

---

## E2E BDD Scenario & Video Proof Deliverable

```gherkin
Feature: Core Engine Initialization & Specification Data Loading
  Scenario: Load game specification data and initialize signal bus
    Given the game engine is booted
    Then DataManager indexes 25 JSON specifications
    And EventBus emits data_loaded signal
    And an E2E video recording is saved to "artifacts/videos/01_core_architecture.mp4"
```

---

## Verification Plan
```bash
python3 tools/validate_v1_schemas.py
python3 tests/e2e/e2e_runner.py
```

