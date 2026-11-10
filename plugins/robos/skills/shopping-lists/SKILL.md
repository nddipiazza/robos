---
name: shopping-lists
description: Manage RobOS Household Shopping Lists (Grocery, Target, Costco) via CLI, natural-language text commands, Smart Multi-Store paste syntax, voice commands, and two-way Google Docs / Google Drive mobile sync.
---

# RobOS Shopping Lists Skill

Manage the user's household shopping lists in `~/.config/robos/household/shopping-lists.json` across the three pre-seeded store lists:
1. **🥬 Grocery** (`grocery`)
2. **🎯 Target** (`target`)
3. **📦 Costco** (`costco`)

No app needs to be open to read, add, check off, adjust quantities, remove items, print checklists, or sync with Google Docs & Google Drive. When the desktop app (`packages/shopping-lists`) or mobile companion server (`:19225`) is open, updates broadcast live over Server-Sent Events (`/api/events`).

## Input

`$ARGUMENTS` — Subcommand or natural-language text command:
- `list [grocery|target|costco|all] [--unchecked|--checked]` — Show items to buy, items in cart, aisle groupings, and estimated totals
- `add "<items>" [--list grocery|target|costco]` — Add one or multiple items with Smart Multi-Store routing (`@grocery`, `@target`, `@costco`), quantities, units, inline prices (`$4.99`), notes (`(extra firm)`), and badges (`#urgent`, `#organic`, `#kirkland`, `#deal`)
- `check "<item name or id>" [--list ...]` — Mark an item checked (in cart)
- `uncheck "<item name or id>" [--list ...]` — Put an item back on the To-Buy list
- `qty "<item name or id>" <+N|-N|N> [--list ...]` — Step quantity (`+1`, `-1`, `+2`) or set exact quantity (`6`)
- `remove "<item name or id>" [--list ...]` — Remove an item from a list (pushes to the Undo stack)
- `clear-checked [--list ...]` — Clear all checked items in a list
- `check-all [--list ...]` / `uncheck-all [--list ...]` — Check or uncheck all items in a list
- `undo` — Restore the last removed or cleared items
- `sync [--pull]` — Run two-way Google Docs & Google Drive sync (creates/updates the 3 Google Docs and pulls mobile `☑`/`☐` edits)
- `export-csv [--list grocery|target|costco]` — Export list items in `packages/household` CSV format
- `print [grocery|target|costco|all]` — Output a clean, fridge-ready printable checklist grouped by aisle
- `guide` — Print the complete Shopping Lists Skills & Text Commands Quick-Reference Guide

## Procedure

1. **Run the Shopping Lists CLI** (`packages/shopping-lists/bin/shopping-lists.js`):
   ```bash
   # Show all lists or a single store list
   node packages/shopping-lists/bin/shopping-lists.js list
   node packages/shopping-lists/bin/shopping-lists.js list costco --unchecked

   # Add items across Grocery, Target, and Costco in one command
   node packages/shopping-lists/bin/shopping-lists.js add "2 gal organic milk $4.89 (whole), 4 avocados, laundry pods @target, kirkland paper towels @costco"

   # Check off, adjust quantity, or remove items
   node packages/shopping-lists/bin/shopping-lists.js check "avocados"
   node packages/shopping-lists/bin/shopping-lists.js qty "avocados" +2
   node packages/shopping-lists/bin/shopping-lists.js remove "laundry pods" --list target

   # Clear checked items or undo last deletion
   node packages/shopping-lists/bin/shopping-lists.js clear-checked --list grocery
   node packages/shopping-lists/bin/shopping-lists.js undo

   # Two-way Google Docs & Google Drive sync
   node packages/shopping-lists/bin/shopping-lists.js sync --pull

   # Print checklist or command cheat sheet
   node packages/shopping-lists/bin/shopping-lists.js print all
   node packages/shopping-lists/bin/shopping-lists.js guide
   ```
   Add `--json` for structured JSON output or `--spoken` for the single-sentence summary that RobOS Voice speaks aloud.

2. **Natural-Language Text Commands**:
   You can also pass any natural sentence directly to the CLI or `POST http://127.0.0.1:19225/api/command`:
   ```bash
   node packages/shopping-lists/bin/shopping-lists.js "what is on my costco list?" --spoken
   node packages/shopping-lists/bin/shopping-lists.js "add 2 bags of honeycrisp apples to grocery and AA batteries to target"
   node packages/shopping-lists/bin/shopping-lists.js "check off rotisserie chicken on costco"
   ```

3. **Smart Multi-Store Shorthand Syntax**:
   - **Store tags**: `@grocery`, `@target`, `@costco`, or phrases `at target`, `on costco list`, `kirkland`, `bulk`
   - **Quantities & units**: `2 gal`, `3 lb`, `16 oz`, `2 pack`, `1 case`, `2 bag`, `1 box`, `1 bunch`, `2 bottle`, `1 jar`, `12 ct`
   - **Inline price**: `$4.99` sets the estimated unit price
   - **Inline note**: `(medium ripe)` at the end of an item sets its note
   - **Badges**: `#urgent` / `must` (`🔥 Must Have`), `#organic` (`🌿 Organic`), `#kirkland` (`⭐ Store Brand`), `#deal` / `coupon` / `sale` (`🏷️ Sale / Coupon`)

4. **Google Docs Mobile Text Syntax**:
   When editing the synced Google Docs (`Grocery — RobOS Shopping List`, `Target — RobOS Shopping List`, `Costco — RobOS Shopping List`) in the Google Docs mobile app:
   - Unchecked: `☐ Avocados — 4 ea · $1.25` or `[ ] Avocados — 4 ea`
   - Checked: `☑ Avocados — 4 ea · $1.25` or `[x] Avocados — 4 ea`
   - Sub-note: `↳ Pick medium-ripe ones`

## Validation

- `node --test packages/robos-test/tests/shopping-lists/unit.test.js`
- `node packages/shopping-lists/bin/shopping-lists.js list --json` returns `ok: true` with `grocery`, `target`, and `costco` lists.
