---
title: "RobOS JRPG Parse Portal"
package: jrpg-parse-portal
category: games
icon: jrpg-parse-portal.svg
summary: "Rebuild a classic JRPG from fan resources: maps, sprites, enemies, menus, rules and story as a knowledge graph, published as a GitHub Pages viewer"
description: "Rebuild a classic JRPG from fan resources: maps, sprites, enemies, menus, rules and story as a knowledge graph, published as a GitHub Pages viewer"
---

**JRPG Parse Portal** gathers everything a remake of a classic JRPG needs from fan resources and writes it as a kgraph folder.

1. **Plan**: every asset type a remake needs (world and area maps, playable classes and sprites, enemies and bosses, encounter formations, weapons, armor, items, spells, shops, menu screens, the rule engine, story milestones, music) and the fan sources the game's profile reads for each.
2. **Discover with agent**: the robos agent (your active coding agent) suggests more fan sites. Each suggestion is checked and probed before it is recorded.
3. **Acquire**: reads the wikis, map atlases, walkthroughs and fan music pages and writes the kgraph folder, with a coverage report and a list of anything it could not get.
4. **Publish site**: KGraph Explorer's Pages builder turns the folder into a GitHub Pages viewer. Each element is drawn by its own renderer, its parent type's, or the generic one, and the agent can write renderers for types that have none.

Profiles: **Dragon Warrior** (NES, USA), built from the Quest: Warrior Dragon data store, and **Final Fantasy** (NES, USA), built from the Final Fantasy Wiki, VGMaps, StrategyWiki and the RPGamer archive. Images and maps stay where they are hosted and are credited; only NES-era content is kept.

The command line does the same: `node packages/jrpg-parse-portal/bin/jrpg-portal.js --help`.
