---
title: "RobOS JRPG Parser"
package: robos-jrpg-parser
category: "libraries"
component_type: component
permalink: /robos-jrpg-parser/
redirect_from:
  - /apps/robos-jrpg-parser/
summary: "Offline CLI and pipeline that parses classic JRPG guides, tables, and maps into a W3C SHACL-validated KGraph and generates clean-room pixel art."
description: "RobOS JRPG Parser (packages/robos-jrpg-parser): scan, parse, audit coverage, generate NES-palette sprites/maps via Gemini, and publish clean-room KGraph packages with zero source-quote leakage."
related:
  - /game-playthrough/
  - /robos-graph/
  - /elearning/
---

`packages/robos-jrpg-parser` (`bin/jrpg-parser.js` and `lib/pipeline.js`) converts local folders of user-collected classic JRPG reference material (HTML/Markdown walkthroughs, stat charts, shop lists, screenshots, and area maps) into a W3C SHACL-validated RobOS Knowledge Graph (`.robos/kgraphs/<package>/package.jsonld`), then generates clean-room maps, battle backdrops, and NES-palette sprites.

## Pipeline commands

```bash
node packages/robos-jrpg-parser/bin/jrpg-parser.js scan ~/Downloads/my-game
node packages/robos-jrpg-parser/bin/jrpg-parser.js parse ~/Downloads/my-game --out ~/kgraphs/my-game --title "My Game" --edition "NES (USA)"
node packages/robos-jrpg-parser/bin/jrpg-parser.js coverage --out ~/kgraphs/my-game
node packages/robos-jrpg-parser/bin/jrpg-parser.js art --out ~/kgraphs/my-game --limit 3
node packages/robos-jrpg-parser/bin/jrpg-parser.js publish --out ~/kgraphs/my-game --to ~/published/my-game
```

- **Deterministic table & conflict resolution**: Parses monster, boss, spell, weapon, armor, and shop tables first (`robos:GameMonster`, `robos:GameSpell`, `robos:GameItem`, `robos:GameClass`, `schema:Place`), skips remake/mod pages automatically, and records cross-guide discrepancies in `parsed.json`.
- **Clean-room `publish` gate**: Writes `.gitignore` in the working directory so raw collected files stay private, and verifies zero source filenames, SHA-256 hashes, or verbatim guide quotes appear in the exported folder.
- **Games built with this pipeline**: See [Quest: Warrior Dragon](/games/quest-warrior-dragon/), [Fantasy: Light Warriors](/games/fantasy-light-warriors/), and the two-part [JRPG KGraph eLearning series](/elearning/).

```bash
node --test packages/robos-test/tests/jrpg-parser/unit.test.js
```

Source: [`packages/robos-jrpg-parser`](https://github.com/nddipiazza/robos/tree/main/packages/robos-jrpg-parser).
