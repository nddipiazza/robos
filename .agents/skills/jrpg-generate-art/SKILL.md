---
name: jrpg-generate-art
description: Generate background maps, dungeons, battle backdrops, character sprites and menu screens for a parsed JRPG kgraph with a Gemini image model, using the collected resources as references.
---

# Generate JRPG Art (`jrpg-generate-art`)

Generates images for a game already parsed with `jrpg-parse-assets` and adds them to its kgraph.

## Input

`$ARGUMENTS` — the parsed output folder, and optionally which kinds of image to generate.

## Requirements

- `agy` signed in. Images use its `generate_image` tool through `packages/robos-lib/ai-image.js`, so no API key is needed.
- `python3` with Pillow, for fitting images to the game's size and colors.

## Procedure

1. See what would be generated. `text-only` jobs have no reference image, so the model invents them from the guide's text:
   ```bash
   node packages/robos-jrpg-parser/bin/jrpg-parser.js plan --out <dir>
   ```
2. Try a few first, and look at the results before running everything. Each image takes about a minute:
   ```bash
   node packages/robos-jrpg-parser/bin/jrpg-parser.js art --out <dir> --limit 3
   ```
3. Run the rest. Finished jobs are skipped, so this also resumes an interrupted run:
   ```bash
   node packages/robos-jrpg-parser/bin/jrpg-parser.js art --out <dir> [--kinds world-map,area-map] [--force]
   ```

If one image is wrong, look at its raw file first. Redo just that image with `--only <id>`. If the raw is fine and the shrink step spoiled it, change `tools/nesify.py` and run `art --out <dir> --refit`, which does not call the model.

Kinds: `world-map`, `area-map`, `battle-backdrop`, `class-sprite`, `menu-screen`, and `enemy-sprite`, which is off by default because a game has over a hundred enemies.

## Output

- `assets/generated/<kind>/<id>.png` — the image fitted to the game. Maps keep the model's size and colors with noise removed, sprites and backdrops are game size on the NES palette, and menus are game size in their own colors
- `assets/generated/raw/<id>.img` — what the model returned
- `assets/generated/manifest.json` — model, prompt hash, and references for each image
- A `jrpg:GeneratedImage` node for each image, with `jrpg:depicts`, `jrpg:references` and `jrpg:basis` (`reference` or `text-only`)

## Rules

- Generating sends the reference images to Google through `agy`. Only run it on files the person gave you for this purpose.
- This art derives from a commercial game. Keep the output private unless the person says to publish it.
- Do not use `--dangerously-skip-permissions`. Headless `agy` can read files and generate images without it.

## Validation

- Open a few images from each kind and check them by eye.
- `jrpg-parser coverage --out <dir>` still runs, and failed jobs are listed at the end of the run.
