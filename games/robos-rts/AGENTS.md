# AGENTS.md: `robos-rts` (Starfall Command)

An open-source, *StarCraft II* & *Stormgate* (**SnowPlay**)-inspired deterministic 64Hz Real-Time Strategy (RTS) game and engine built on **Godot 4.3**, featuring a **2.5D Angled 3D Perspective Camera**, **3 Asymmetric Factions (Humans, Monsters, Aliens)**, and an **`s2client-proto` / `python-sc2` compatible Bot Step API (`:18095`)** used identically for Cucumber E2E testing and custom AI bots.

## Core Architecture

1. **2.5D Angled 3D Perspective Renderer ([`scripts/RTSWorld3D.gd`](./scripts/RTSWorld3D.gd) & [`scripts/RTSMain.gd`](./scripts/RTSMain.gd))**:
   - Uses a `Camera3D` pitched at `-56°` (`fov = 42°`) projecting 3D elevated high-ground plateaus (`+2.2` elevation), sloped ramps, canyon cliff walls, 3D mineral crystals, vespene geysers, 3D unit/structure meshes, translucent Alien Plasma Shield bubbles, and ground selection tori.
   - Overlays crisp 2D screen-space HP & Shield bars, box selection, a `3x5` SC2 Command Card, and a tactical minimap.
2. **3 Asymmetric Factions ([`scripts/engine/RTSData.gd`](./scripts/engine/RTSData.gd))**:
   - **Humans (`humans` / Terran Vanguard)**: `SCV` (construction & harvesting), `Marine` (Stimpack + stutter-step kiting), `Marauder` (Concussive Slow + Armored bonus), `Siege Tank` (Tank Mode <-> Siege Mode 31-range splash), `Command Center`, `Supply Depot` (Raise/Lower choke gate), `Refinery`, `Barracks`, `Factory`.
   - **Monsters (`monsters` / Xenomorph Swarm)**: `Drone`, `Swarmling` (ultra-fast melee swarm), `Roach` (armored acid ranged), `Ravager` (corrosive plasma splash), `Hatchery`.
   - **Aliens (`aliens` / Celestial Armada)**: Regenerating **Plasma Shields** across all units & structures, `Probe` (autonomous warp construction), `Zealot` (Psi Blades + `Charge` speed burst), `Stalker` (`Blink` teleport micro!), `Colossus` (Thermal Lance splash + **Cliff-Walk** over canyon walls), `Nexus`, `Pylon`, `Gateway`.
3. **Decoupled 64Hz SnowPlay-Style Simulation Core ([`scripts/engine/SimEngine.gd`](./scripts/engine/SimEngine.gd))**:
   - Runs at a deterministic 64Hz fixed step (`TICK_DT = 1.0 / 64.0`), completely decoupled from rendering FPS.
   - Implements SC2 Constrained Funnel A\*, RVO2 velocity steering, Allied `PushPriority` displacement & return-to-post, and `DamagePoint`/`Backswing` stutter-step combat micro.
4. **Unified Bot & Testing API ([`scripts/GameControlServer.gd`](./scripts/GameControlServer.gd) & [`robos_sc2_bot_sdk.py`](./robos_sc2_bot_sdk.py))**:
   - The exact same `/observation`, `/action`, `/step`, `/directive`, and `/scenario` HTTP/JSON endpoints (`:18095`) and `RobOSSC2Client` / `SC2BotBase` Python SDK power both Cucumber E2E tests and custom external bots.

## Running the Game & E2E Tests

```bash
# Launch interactive 2.5D Angled 3D RTS game
./play.sh

# Run headless deterministic 3-faction Cucumber E2E test suite (~4.9s for all 5 scenarios)
./run_cucumber_tests.py --backend
```
