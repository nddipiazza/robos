---
title: "cRPG Game Builder Academy"
package: crpg-game-builder-elearning
category: learning
summary: "A window that opens the cRPG game-building training pages from the docs folder."
description: "This package is a thin Electron shell around the static eLearning page in docs/projects/crpg-realm/create-your-own-game/elearning. It has no features of its own."
icon: crpg-game-builder-elearning.svg
---

The app creates one 1400 by 900 window and loads `docs/projects/crpg-realm/create-your-own-game/elearning/index.html` from the repository with `loadFile`. The page is titled "RobOS cRPG Game Builder & Tactical Engine Academy". All content lives in that HTML file; the package adds no menus, storage or network access.

It only works from a full checkout of the repository, because the path to the page is relative to the package (`../../docs/...`). Its `.desktop` file hardcodes `/home/ndipiazza/source/robos/packages/crpg-game-builder-elearning`, so edit that path before installing it on another machine.

```bash
electron packages/crpg-game-builder-elearning
```

The same material is in the docs under [Tactical cRPG & Infinity AI Engine]({{ '/projects/crpg-realm/' | relative_url }}). A different package, `packages/robos-crpg-elearning`, starts the `robos-elearning` runtime with the `robos-crpg` course selected. Source: [`packages/crpg-game-builder-elearning`](https://github.com/nddipiazza/robos/tree/main/packages/crpg-game-builder-elearning).
