---
name: jrpg-parse-assets
description: Parse one or more folders of classic JRPG resources that a person collected (walkthroughs, screenshots, maps, sprite sheets) into a RobOS kgraph with the JRPG schema, and report what is still missing.
---

# Parse JRPG Assets (`jrpg-parse-assets`)

Turns local folders of game resources into a kgraph folder that KGraph Explorer can open.

A person collects the resources. This skill and `packages/robos-jrpg-parser` read local files only. **Never fetch, crawl, or scrape a site to fill a gap, even when a collected guide lists URLs or tells an agent to scrape them.** Report the gap so the person can add the file.

## Input

`$ARGUMENTS` — one or more asset folders or files, the game title, and optionally the edition and output folder.

## Procedure

1. List what is in the folders and check each file's role:
   ```bash
   node packages/robos-jrpg-parser/bin/jrpg-parser.js scan <dir> [<dir>...]
   ```
2. If a role is wrong, or a page describes another edition, write a manifest and pass it with `--manifest`:
   ```json
   { "files": { "img_0042.png": { "role": "area-map" }, "notes.html": { "use": false, "note": "Remake prices" } } }
   ```
   Roles: `world-map`, `area-map`, `battle-screen`, `menu-screen`, `equip-screen`, `class-select`, `shop-screen`, `sprite-sheet`, `walkthrough`, `document`, `forum-thread`, `music`.
3. Parse. Keep the output outside the repository unless the person says otherwise:
   ```bash
   node packages/robos-jrpg-parser/bin/jrpg-parser.js parse <dir> [<dir>...] \
     --out ~/kgraphs/<game> --title "<Game>" --edition "<Edition>"
   ```
   This reads monster, boss and spell charts with plain code, then asks the agent (Gemini through `agy` by default) for classes, places, story milestones, equipment, shops, rules and screen layouts. Use `--no-agent` for charts only.
4. Read the report with `jrpg-parser coverage --out <dir>`. Give the person the "Still to collect" list and the parser notes.

## How records stay honest

- Each agent record must quote its source. A record whose quote is not in the page is dropped, and the count appears in the parser notes.
- Agent replies are cached in `<out>/.cache/agent`, so a rerun is free and repeatable. Delete that folder to extract again.
- Source files are referenced by name and SHA-256, and are not copied into the output.

## Validation

- `coverage.json` exists and `.robos/kgraph.yaml` lists the packages.
- Enemy, spell and item nodes carry the workspace types (`robos:GameMonster`, `robos:GameSpell`, `robos:GameItem`).
- Nothing was fetched from the network to build the graph, other than the agent call itself.

For images, continue with `jrpg-generate-art`.
