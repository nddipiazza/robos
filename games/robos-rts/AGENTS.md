# AGENTS.md: `robos-rts` (Starfall Command)

An open-source, *StarCraft II* & *Stormgate* (**SnowPlay**)-inspired deterministic 64Hz Real-Time Strategy (RTS) game and engine built on **Godot 4.3**, powered by the RobOS Dual-State Knowledge Graph and an **`s2client-proto` / `python-sc2` compatible Bot Step API (`:18095`)**.

## Core Architecture

1. **Decoupled 64Hz SnowPlay-Style Simulation Core ([`scripts/engine/SimEngine.gd`](./scripts/engine/SimEngine.gd))**:
   - Runs at a deterministic 64Hz fixed step (`TICK_DT = 1.0 / 64.0`), completely decoupled from the rendering framerate.
   - Can advance thousands of ticks per second in headless step mode (`RTS_MODE=backend`) or run in real-time 64Hz (`RTS_MODE=human`).
2. **StarCraft II Navigation & Crowd Fluidity**:
   - **Dynamic Footprint Grid + Funnel String-Pulling A\***: Structures (`5x5` Command Center, `3x3` Barracks/Factory, `2x2` Supply Depot) dynamically block navigation cells, while lowered Supply Depots (`is_walkable_structure = true`) open choke points for unit traversal.
   - **RVO2 Velocity Steering + Boids Separation**: Units query an $O(1)$ spatial hash grid (`SPATIAL_CELL_SIZE = 4.0`) to smoothly curve around neighbors without gridlock.
   - **SC2 Allied `PushPriority` & Return**: Moving friendly units with higher or equal `push_priority` displace idle allied units out of their path; displaced idle allies remember their `home_pos` and automatically walk back once clear.
3. **StarCraft II Combat Micro State Machine ([`scripts/engine/RTSData.gd`](./scripts/engine/RTSData.gd))**:
   - Every weapon defines exact `damage_point` (wind-up time before the shot fires), `backswing` (cancelable recovery animation), `period` (cooldown), `range`, `bonus` (e.g. `+10 vs Armored`), and `splash_radius`.
   - Issuing a `move` command during `backswing` immediately cancels the recovery animation while `weapon_cooldown` ticks down on the move—enabling authentic **Marine stutter-step kiting**.
4. **`s2client-proto` / `python-sc2` Bot API ([`scripts/GameControlServer.gd`](./scripts/GameControlServer.gd) & [`robos_sc2_bot_sdk.py`](./robos_sc2_bot_sdk.py))**:
   - Exposes `/health`, `/observation`, `/action`, `/step`, `/directive`, and `/scenario` on HTTP port `18095`.

## Running the Game & E2E Tests

```bash
# Launch interactive RTS game
./play.sh

# Run headless deterministic Cucumber E2E test suite (~3.3 seconds for all 4 scenarios)
./run_cucumber_tests.py --backend
```
