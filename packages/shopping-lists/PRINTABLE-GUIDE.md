# 🛒 RobOS Shopping Lists — Printable Skills & Text Commands Guide

**Pre-Seeded Household Store Lists**:
1. **🥬 Grocery** (`grocery` / `@grocery`) — Weekly produce, dairy, meat, bakery & pantry
2. **🎯 Target** (`target` / `@target`) — Household essentials, pharmacy, personal care & home run
3. **📦 Costco** (`costco` / `@costco`) — Warehouse club bulk haul, Kirkland Signature & freezer stock-up

---

## 1. AI Agent Skill & Slash Commands (`/shopping-lists`)

Works in **Claude Code**, **OpenAI Codex**, **Google Antigravity**, **GitHub Copilot**, and **Gemini CLI**:

| Slash / Skill Command | Description |
| :--- | :--- |
| `/shopping-lists list` | Show all 3 lists (`Grocery`, `Target`, `Costco`) with aisle groupings and totals |
| `/shopping-lists list grocery` | Show only the **Grocery** list (`target` or `costco` for the others) |
| `/shopping-lists list costco --unchecked` | Show only remaining **To-Buy** items on the Costco list |
| `/shopping-lists add "2 gal milk, 4 avocados"` | Add items to the active (or Grocery) list with auto-detected aisles |
| `/shopping-lists add "2 gal milk, tide pods @target, rotisserie chicken @costco"` | Add & auto-route items across **Grocery**, **Target**, and **Costco** in one line |
| `/shopping-lists check "avocados"` | Mark matching item checked (`☑` In Cart) |
| `/shopping-lists uncheck "avocados"` | Uncheck item (`☐` back to To-Buy) |
| `/shopping-lists qty "avocados" +2` | Increment (`+2`), decrement (`-1`), or set exact quantity (`6`) |
| `/shopping-lists remove "tide pods" --list target` | Remove item from a list (pushed onto the Undo stack) |
| `/shopping-lists clear-checked --list grocery` | Remove all checked-off items from a list |
| `/shopping-lists check-all --list costco` | Check off every item on a list (`uncheck-all` to reset) |
| `/shopping-lists undo` | Restore the last removed or cleared items |
| `/shopping-lists sync --pull` | Two-way Google Docs & Google Drive sync (pushes & pulls mobile `☑`/`☐` edits) |
| `/shopping-lists export-csv --list grocery` | Export list to `packages/household` CSV format |
| `/shopping-lists print [all\|grocery\|target\|costco]` | Output a clean, fridge-ready printable checklist grouped by aisle |
| `/shopping-lists guide` | Print this Skills & Text Commands Cheat Sheet |

---

## 2. Smart Text & Quick-Paste Shorthand Syntax

Use this shorthand in the **Smart Paste / AI Multi-Add** bar (Desktop & Mobile Web), in `/shopping-lists add "..."`, or via CLI. Separate items with **commas (`,`)**, **semicolons (`;`)**, or **new lines**:

### A. Store Routing Tags
| Tag / Phrase | Routes Item To | Example |
| :--- | :--- | :--- |
| `@grocery`, `at grocery`, `on grocery list`, `grocery:` | **🥬 Grocery** | `2 lb honeycrisp apples @grocery` |
| `@target`, `at target`, `from target`, `target:` | **🎯 Target** | `Method foaming hand soap @target` |
| `@costco`, `at costco`, `kirkland`, `bulk`, `case of` | **📦 Costco** | `kirkland paper towels @costco` |

### B. Quantity & Unit Prefixes
| Prefix | Parsed Qty & Unit | Supported Units |
| :--- | :--- | :--- |
| `2 gal organic milk` | `qty: 2`, `unit: gal` | `ea`, `pack`, `lb`, `oz`, `gal`, `case`, `bag`, `box`, `bunch`, `bottle`, `jar` |
| `three avocados` | `qty: 3`, `unit: ea` | Supports numbers (`1`–`99`) and words (`one`–`twelve`, `dozen`) |

### C. Inline Price, Notes & Badges
| Token | Effect | Example |
| :--- | :--- | :--- |
| `$<price>` | Sets estimated unit price | `ribeye steaks $34.99 @costco` |
| `(<note>)` | Parentheses at the end set the item note | `hass avocados (medium ripe)` |
| `#urgent` or `must` | Adds **🔥 Must Have** badge | `infant ibuprofen #urgent @target` |
| `#organic` or `organic` | Adds **🌿 Organic** badge | `2 gal organic whole milk` |
| `#kirkland` or `kirkland` | Adds **⭐ Store Brand** badge & routes to Costco | `kirkland extra virgin olive oil` |
| `#deal`, `coupon`, `sale` | Adds **🏷️ Sale / Coupon** badge | `Cheerios family size #deal` |

---

## 3. "Commander" Voice & Natural Text Commands (RobOS Assistant / RobOS Voice)

Say or type any of these natural phrases with **RobOS Assistant (`"Commander"`)**, **RobOS Voice**, **Home Speaker**, or the CLI:

- **Read / Inspect lists & aisles**:
  - `"Commander, can you see my grocery list?"` / `"Commander, what groceries do we need?"`
  - `"Commander, read the full grocery list"` / `"Commander, read my grocery list by aisle"`
  - `"Commander, what do we need in Produce?"` / `"Commander, what's in the dairy aisle?"`
  - `"Commander, what's in my cart?"` / `"Commander, how much is my Costco list?"`
  - `"Commander, what urgent items are on my grocery list?"` / `"Commander, any deals on Target?"`
- **Check if an item is already on the list**:
  - `"Commander, is milk on my grocery list?"` / `"Commander, do we need avocados?"`
  - `"Commander, did I put paper towels on Target?"`
- **Add items & kitchen out-of-stock triggers**:
  - `"Commander, add 2 gallons of milk and 4 avocados to the grocery list"`
  - `"Commander, we're out of eggs and butter"` / `"Commander, running low on olive oil"`
  - `"Commander, remind me to buy sourdough bread"` / `"Commander, add laundry detergent to Target and rotisserie chicken to Costco"`
- **Meal bundles & 1-sentence staples**:
  - `"Commander, add taco night to my grocery list"` *(also `pasta night`, `breakfast essentials`, `burger night`, `pizza night`, `smoothie ingredients`, `stir fry night`, `salad stuff`, `lunchbox essentials`, `baking essentials`, `party snacks`, `sick day kit`)*
  - `"Commander, add my grocery staples"` / `"Commander, what are my Costco staples?"`
- **Check off, uncheck, move, annotate & adjust**:
  - `"Commander, check off avocados and milk"` / `"Commander, I got the rotisserie chicken"`
  - `"Commander, put milk back on my grocery list"`
  - `"Commander, double the avocados"` / `"Commander, add 2 more avocados"` / `"Commander, set quantity of milk to 3"`
  - `"Commander, move paper towels to Costco"`
  - `"Commander, add a note to milk: get lactose free"` / `"Commander, mark eggs as urgent"` / `"Commander, set price of salmon to 12.99"`
- **Remove, clear, custom lists & undo**:
  - `"Commander, take Tide pods off Target"` / `"Commander, we don't need avocados anymore"`
  - `"Commander, clear checked on grocery list"` / `"Commander, empty my grocery list"`
  - `"Commander, create a Trader Joe's shopping list"` / `"Commander, undo"`

---

## 4. Google Docs Mobile Text Syntax (Two-Way Sync)

Each list syncs to its own Google Doc in your **RobOS Household Shopping Lists** Google Drive folder. When viewing or editing in the **Google Docs mobile app**:

| Google Doc Line | Meaning on Two-Way Sync |
| :--- | :--- |
| `☐ Organic Honeycrisp Apples — 2 bag · $5.49 [🌿 ORGANIC]` | **Unchecked** item (`To Buy`), qty `2 bag`, unit price `$5.49`, badge `organic` |
| `☑ Rotisserie Chicken — 1 ea · $4.99` | **Checked** item (`In Cart`) — change `☐` to `☑` (or `[x]`) on phone to check off |
| `[ ] Whole Milk — 1 gal` | Plain-text **unchecked** item added on mobile |
| `[x] Whole Milk — 1 gal` | Plain-text **checked** item marked on mobile |
| `↳ Pick medium-ripe ones` | Indented sub-line sets or updates the item's `note` |

---

## 5. Terminal CLI & Local HTTP Endpoints

### Terminal CLI (`packages/shopping-lists/bin/shopping-lists.js`)
```bash
# View lists or print a fridge checklist
node packages/shopping-lists/bin/shopping-lists.js list
node packages/shopping-lists/bin/shopping-lists.js print all

# Add, check, step quantity, remove, undo
node packages/shopping-lists/bin/shopping-lists.js add "2 gal milk, AA batteries @target, croissants @costco"
node packages/shopping-lists/bin/shopping-lists.js check "avocados"
node packages/shopping-lists/bin/shopping-lists.js qty "avocados" +2
node packages/shopping-lists/bin/shopping-lists.js remove "AA batteries" --list target
node packages/shopping-lists/bin/shopping-lists.js undo

# Run any natural-language text command
node packages/shopping-lists/bin/shopping-lists.js "what is on my costco list?" --spoken
```

### Local HTTP Companion API (`http://127.0.0.1:19225`)
| Method & Path | Description |
| :--- | :--- |
| `GET  http://127.0.0.1:19225/` | Mobile-friendly Web Form Companion (scan QR code in desktop app) |
| `GET  http://127.0.0.1:19225/guide` | **Printable HTML Cheat Sheet** (with `@media print` styling & **Print Guide** button) |
| `GET  http://127.0.0.1:19225/print?list=all` | Plain-text printable checklist (`all`, `grocery`, `target`, `costco`) |
| `GET  http://127.0.0.1:19225/doc-preview/grocery` | Live Google Doc mobile preview (`grocery`, `target`, `costco`) |
| `POST http://127.0.0.1:19225/api/command` | Execute any text command: `{"command": "add 2 avocados @grocery"}` |
| `POST http://127.0.0.1:19225/api/smart-add` | Smart multi-item add: `{"text": "milk, eggs, tide @target"}` |
