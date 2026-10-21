# EPIC-06: Audio Routing, Screen FX & UI Window System

## Overview
Implement declarative BGM track routing, sound effect triggers, screen transition animations, and retro NES UI window framing.

---

## Data Specs
- `assets/music/mp3/` — Original track library (90+ tracks for towns, overworld, dungeons, battles).
- `src/systems/AudioEngine.gd` — EventBus-driven audio manager.

---

## Parallelizable Task Cards

### TASK-06.1: Declarative Audio Routing Engine
- **Owner**: Dev / AI Agent A
- **Files**: `src/systems/AudioEngine.gd`
- **Requirement**: Play background music matching location (`Tantegel`, `Overworld`, `Dungeon`, `Battle`) responsive to `EventBus` signals.
- **Acceptance Criteria**:
  - Entering battle plays combat music; returning to overworld resumes location track smoothly.

### TASK-06.2: NES Window & Text Box UI Framework
- **Owner**: Dev / AI Agent B
- **Files**: `src/ui/NESWindow.gd`, `src/ui/StatsWindow.gd`
- **Requirement**: Modular NES-style black box with white border for text rendering, command menus, and status displays.
- **Acceptance Criteria**:
  - Reusable UI component renders cleanly in GL Compatibility renderer.

### TASK-06.3: Transition Effects & Screen Animations
- **Owner**: Dev / AI Agent C
- **Files**: `src/systems/SceneManager.gd`, `src/ui/ScreenFade.gd`
- **Requirement**: Black curtain screen fade in/out for map teleports and combat encounter flash.
- **Acceptance Criteria**:
  - Smooth 0.3s fade transition on stair teleports and battle starts.
