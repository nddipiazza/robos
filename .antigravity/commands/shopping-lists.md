# /shopping-lists

Manage your **RobOS Household Shopping Lists** (`1) Grocery`, `2) Target`, `3) Costco`) from the command line, AI coding agents, or voice — with Smart Multi-Store text routing, printable checklists, and two-way Google Docs & Google Drive mobile sync.

## Usage

```bash
/shopping-lists list [grocery|target|costco|all]               # show items, aisles, and estimated totals
/shopping-lists add "2 gal milk, tide pods @target, rotisserie chicken @costco"
/shopping-lists check "avocados"                               # mark item checked (in cart)
/shopping-lists uncheck "avocados"                             # put item back on To-Buy list
/shopping-lists qty "avocados" +2                              # adjust quantity (+N, -N, or exact N)
/shopping-lists remove "tide pods" --list target               # remove item (saved to Undo stack)
/shopping-lists clear-checked --list grocery                   # clear checked-off items
/shopping-lists undo                                           # undo last remove/clear
/shopping-lists sync --pull                                    # two-way Google Docs & Drive sync
/shopping-lists print [grocery|target|costco|all]              # printable checklist grouped by aisle
/shopping-lists guide                                          # printable skills & text commands guide
```

Runs `node packages/shopping-lists/bin/shopping-lists.js <args>`. See `plugins/robos/skills/shopping-lists/SKILL.md`.
