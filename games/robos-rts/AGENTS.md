# AGENTS.md: `robos-rts` (Starfall Command)

An open-source deterministic 64Hz Real-Time Strategy (RTS) game and engine built on **Godot 4.3**, featuring a **2.5D Angled 3D Perspective Camera**, **3 Asymmetric Factions (Humans, Monsters, Aliens)**, and an **HTTP/JSON observation / action / step bot API (`:18095`)** used identically for Cucumber E2E testing and custom AI bots.

## Core Architecture

1. **2.5D Angled 3D Perspective Renderer ([`scripts/RTSWorld3D.gd`](./scripts/RTSWorld3D.gd) & [`scripts/RTSMain.gd`](./scripts/RTSMain.gd))**:
   - Uses a `Camera3D` pitched at `-56°` (`fov = 42°`) projecting 3D elevated high-ground plateaus (`+2.2` elevation), sloped ramps, canyon cliff walls, 3D crystal crystals, aether vents, 3D unit/structure meshes, translucent Alien Aegis Shield bubbles, and ground selection tori.
   - Overlays crisp 2D screen-space HP & Shield bars, box selection, a `3x5` command card, and a tactical minimap.
2. **3 Asymmetric Factions ([`scripts/engine/RTSData.gd`](./scripts/engine/RTSData.gd))**:
   - **Humans (`humans` / Meridian Guard)**: `Pioneer` (construction & harvesting), `Rifleman` (Surge Injector + stutter-step kiting), `Breacher` (Concussive Slow + Armored bonus), `Howitzer` (Mobile Mode <-> Emplaced Mode 31-range splash), `Colony Hub`, `Provision Silo` (Raise/Lower choke gate), `Aether Tap`, `Muster Hall`, `Workshop`.
   - **Monsters (`monsters` / Gnarl Brood)**: `Forager`, `Skitterling` (ultra-fast melee swarm), `Bile Crawler` (armored acid ranged), `Blight Hurler` (corrosive plasma splash), `Brood Nest`.
   - **Aliens (`aliens` / Aurelian Concord)**: Regenerating **Aegis Shields** across all units & structures, `Mote` (autonomous summon construction), `Sunblade` (Light Blades + `Charge` speed burst), `Skirmisher` (`Phase Step` teleport micro!), `Spire Walker` (Prism Beam splash + **Cliff-Walk** over canyon walls), `Heartstone`, `Resonator`, `Waystone`.
3. **Decoupled 64Hz Simulation Core ([`scripts/engine/SimEngine.gd`](./scripts/engine/SimEngine.gd))**:
   - Runs at a deterministic 64Hz fixed step (`TICK_DT = 1.0 / 64.0`), completely decoupled from rendering FPS.
   - Implements funnel-smoothed A\* paths, RVO-style velocity steering, Allied `push priority` displacement & return-to-post, and `wind-up`/`recovery` stutter-step combat micro.
4. **Unified Bot & Testing API ([`scripts/GameControlServer.gd`](./scripts/GameControlServer.gd) & [`robos_rts_bot_sdk.py`](./robos_rts_bot_sdk.py))**:
   - The exact same `/observation`, `/action`, `/step`, `/directive`, and `/scenario` HTTP/JSON endpoints (`:18095`) and `RTSClient` / `RTSBotBase` Python SDK power both Cucumber E2E tests and custom external bots.

## Running the Game & E2E Tests

```bash
# Launch interactive 2.5D Angled 3D RTS game
./play.sh

# Run headless deterministic 3-faction Cucumber E2E test suite (~4.9s for all 5 scenarios)
./run_cucumber_tests.py --backend
```
