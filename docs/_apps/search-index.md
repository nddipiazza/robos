---
title: "Search Indexer"
package: search-index
category: core-desktop
icon: search-index.svg
summary: "Builds plain-text lists of file paths under folders you choose, which RobOS text areas search for @-mentions."
description: "Walks the folders of each index and saves their paths to ~/.config/robos/search-index. It indexes file and folder names only, not file contents or code symbols."
---

Search Indexer keeps lists of paths so that other RobOS apps can offer fast `@file` suggestions without scanning the disk on each keystroke. For example, the AI Prompt app matches what you type against these lists.

## How it works

Each index is a name, a set of folders to scan and a list of excluded folder names. Rebuilding an index walks those folders and writes every path found to `~/.config/robos/search-index/<index-id>.txt`, one per line. Names that start with a dot are skipped, as are the excluded names. Search is a case-insensitive substring match on the path. There is no content or symbol indexing and no fuzzy ranking.

Two system indexes are created on first run and cannot be deleted:

| Index | Scans | Excludes |
|---|---|---|
| Source Projects | `~/source` | `node_modules`, `.git`, `dist`, `.cache`, `target`, `__pycache__`, `.tox` |
| RobOS Config | `~/.config/robos` | `search-index` |

Index definitions are stored in `~/.config/robos/search-indexes.json`. Other apps can add their own `.txt` files to the same folder; [People Directory]({{ '/apps/people-directory/' | relative_url }}) writes `people.txt` there. Apps that read the folder use every `.txt` file in it, whether or not it is listed in the app.

## Use it

1. Open **RobOS Search Index**. The left panel lists the indexes with their file counts.
2. Select an index and click **Rebuild** to scan it, or **Rebuild All** to scan all of them. The indexes start empty until you do this.
3. **+ Add Index** asks for a name and the paths to index, one per line (a leading `~` is expanded), and then **Create Index**. New indexes exclude `node_modules`, `.git` and `dist`. **Delete** removes a custom index and its file.
4. Use **Test Search** to check what a query returns (up to 30 results).

The indexes are not refreshed automatically, so rebuild after adding many files.

## Run it

Launch **RobOS Search Index** from the app launcher, or run `npm start` in `packages/search-index`. Only one window runs at a time.
