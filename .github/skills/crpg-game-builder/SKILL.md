---
name: crpg-game-builder
description: Build, validate, and maintain party-based tactical isometric cRPGs in Godot 4 using the RobOS Dual-State Knowledge Graph, Flare RPG assets, and D&D 5e SRD rules.
---

# RobOS cRPG Game Builder (`crpg-game-builder`)

Build, balance, and maintain party-based tactical isometric cRPGs (Infinity Engine / Baldur's Gate style) using the **RobOS Dual-State Knowledge Graph** and **Godot 4**.

## Architecture & Separation of Concerns

1. **Semantic Graph Layer (`.robos/kgraphs/crpg/package.jsonld`)**:
   - Master definition of the game world: Classes, Monsters, Spells, Items, Quests, Dialogue Trees, Map Zones, Test Suites, and Agent Sessions.
   - Governed by W3C SHACL shape validation (`CRPGGameShape`, `CRPGMonsterShape`, etc.).
   - Dual-state semantic diffing (`kgraph diff main`) detects broken dialogue references, missing sprite bindings, and level balance issues before code generation.
2. **Open-Source Asset Pipeline**:
   - Ingests **Flare RPG (`flareteam/flare-game`)** CC-BY-SA 3.0 assets: 100+ animated 8-directional isometric creatures, modular paperdoll armor/weapons, isometric environmental tilesets, icons, and audio.
   - Ingests **Game-Icons.net** (4,000+ vector icons) and OpenGameArt collections.
3. **Engine Runtime Layer (`games/crpg-realm/`)**:
   - Decoupled Godot 4 GL Compatibility game project.
   - Consumes compiled JSON data files (`data/v1/*.json`), validated against JSON Schemas (`schemas/v1/*.json`).
   - Uses generated statically-typed GDScript data models (`src/generated/v1/*.gd`).
   - Embedded `GameControlServer.gd` HTTP REST service for live telemetry and headless E2E action injection.
   - Real-Time with Pause (RTwP) combat controller and isometric party navigation.
4. **Xvfb RobOS Agent Session & Cucumber E2E Verification**:
   - Runs Godot 4 in an isolated headless Xvfb virtual display (`:99`).
   - Captures high-definition MP4 video proof-of-work via FFmpeg.
   - Asserts game telemetry via `GET /api/v1/state` and injects actions via `POST /api/v1/action`.
   - Generates interactive HTML reports with embedded video players and GameState JSON inspections.

---

## Commands & Workflows

### 1. Re-Generate Engine Code and Data from Knowledge Graph
Run the generator whenever the KGraph is updated:
```bash
node packages/crpg-builder/bin/crpg-builder.js generate
```

### 2. Validate KGraph Shape Integrity
```bash
node packages/crpg-builder/bin/crpg-builder.js validate
```

### 3. Verify Data Store Integrity
```bash
python3 games/crpg-realm/tests/validate_schemas.py
```

### 4. Run Automated Unit Tests
```bash
npm --prefix packages/crpg-builder test
```

### 5. Run Full Playthrough E2E Simulation
Simulates the entire 30-minute Early Access game loop from Character Selection through Homestead, Village Square, Garrison Keep, Boss Combat, and Terminal Victory State:
```bash
python3 games/crpg-realm/tests/test_playthrough_slice.py
```

### 6. Run Cucumber E2E Test Suite in Xvfb with Video Capture
Runs the automated BDD Cucumber suite on an isolated virtual display with video proof-of-work (mirroring Dragon Warrior):
```bash
python3 games/crpg-realm/run_cucumber_tests.py
```
Outputs:
- Videos: `games/crpg-realm/tests/e2e/reports/videos/<scenario>.mp4`
- Telemetry: `games/crpg-realm/tests/e2e/reports/gamestate_<scenario>.json`
- Interactive HTML Report: `games/crpg-realm/tests/e2e/reports/index.html`

### 7. Run Godot 4 Headless Verification
```bash
./games/crpg-realm/debug.sh --scene TestRunner --headless
```

### 8. Programmatic Agent Session Execution
```javascript
const { XvfbRobOSAgentSession } = require('packages/crpg-builder/lib/xvfb-agent-session');
const session = new XvfbRobOSAgentSession({ display: ':99', webPort: 18090 });
const result = await session.runE2ESuite();
console.log('Passed:', result.success, 'Artifacts:', result.artifacts);
```

---

## Adding New Content to the Game

### Adding a Monster
Add a new node to `.robos/kgraphs/crpg/package.jsonld`:
```json
{
  "@id": "urn:robos:crpg:monster:dire-wolf",
  "@type": ["oslc_am:Resource", "robos:CRPGMonster", "schema:Person"],
  "dcterms:title": "Dire Wolf",
  "robos:challengeRating": "1",
  "robos:armorClass": 14,
  "robos:hitPoints": 37,
  "robos:speed": 50,
  "robos:abilities": { "STR": 17, "DEX": 15, "CON": 15, "INT": 3, "WIS": 12, "CHA": 7 },
  "robos:spriteAssetRef": "flare:creature:wolf",
  "robos:package": "crpg",
  "robos:namespace": "robos.crpg"
}
```

### Adding a Spell
```json
{
  "@id": "urn:robos:crpg:spell:bless",
  "@type": ["oslc_am:Resource", "robos:CRPGSpell", "schema:Action"],
  "dcterms:title": "Bless",
  "robos:spellLevel": 1,
  "robos:magicSchool": "Enchantment",
  "robos:castingTime": "1 action",
  "robos:range": "30 feet",
  "robos:damageFormula": "1d4",
  "robos:damageType": "buff",
  "robos:package": "crpg",
  "robos:namespace": "robos.crpg"
}
```

After modifying the graph:
1. Run `node packages/crpg-builder/scripts/sync-aggregate.js`
2. Run `node packages/crpg-builder/bin/crpg-builder.js generate`
3. Run `python3 games/crpg-realm/run_cucumber_tests.py`
