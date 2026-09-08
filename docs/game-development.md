---
title: Game Development
layout: default
nav_order: 15
---

# Game Development: PC Games & Mobile Games
{: .no_toc }

Architect, scaffold, and manage PC and Mobile video game projects in RobOS aligned with Schema.org `schema:VideoGame` and `schema:MobileApplication`.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Overview

RobOS provides first-class support for game development across two dedicated software archetypes in the Knowledge Graph:
1. **PC Games (`robos:PCGame`)**: Desktop video games targeting Windows, Linux, and macOS platforms.
2. **Mobile Games (`robos:MobileGame`)**: Handheld video games targeting iOS and Android mobile devices.

Both archetypes integrate with [Schema.org VideoGame](https://schema.org/VideoGame) and Wikidata standards (`wd:Q10590` for PC games, `wd:Q1149622` for mobile games).

---

## Supported Game Engines

- **Unreal Engine 5** (C++ / Blueprints) with DirectX 12, Vulkan, and Nanite/Lumen asset pipelines.
- **Unity 6** (C#) for cross-platform desktop and mobile games.
- **Godot 4.2+** (GDScript / C#) for lightweight 2D and 3D games.
- **Bevy Engine** (Rust) for data-driven ECS rendering.

---

## PC Game Schema & Properties (`robos:PCGame`)

Conforms to `urn:robos:shape:PCGameShape`:

```json
{
  "@id": "urn:robos:pc-game:space-raiders-pc",
  "@type": [
    "robos:PCGame",
    "schema:VideoGame",
    "oslc_am:Resource",
    "c4:Container"
  ],
  "dcterms:title": "Space Raiders PC Game",
  "dcterms:description": "Interactive PC video game built with Unreal Engine 5.",
  "robos:repository": "github.com/acme-org/space-raiders-pc",
  "robos:technology": "C++ / Unreal Engine 5",
  "robos:gameEngine": "Unreal Engine",
  "robos:targetPlatform": ["Windows", "Linux", "macOS"],
  "robos:graphicsApi": "DirectX 12 / Vulkan",
  "schema:gamePlatform": "PC",
  "schema:playMode": "SinglePlayer",
  "robos:ownerTeam": "urn:robos:team:core-platform"
}
```

### SHACL Constraints (`PCGameShape`)
- **`dcterms:title`**: Game title (minCount: 1)
- **`robos:repository`**: Canonical Git repository URL (minCount: 1)
- **`robos:technology`**: Runtime technology stack (minCount: 1)
- **`robos:gameEngine`**: Engine (Unreal Engine, Unity, Godot, Bevy) (minCount: 1)
- **`robos:targetPlatform`**: Target PC platforms (Windows, Linux, macOS) (minCount: 1)

---

## Mobile Game Schema & Properties (`robos:MobileGame`)

Conforms to `urn:robos:shape:MobileGameShape`:

```json
{
  "@id": "urn:robos:mobile-game:puzzle-quest-mobile",
  "@type": [
    "robos:MobileGame",
    "schema:VideoGame",
    "schema:MobileApplication",
    "oslc_am:Resource",
    "c4:Container"
  ],
  "dcterms:title": "Puzzle Quest Mobile Game",
  "dcterms:description": "Interactive mobile video game for iOS and Android built with Unity 6.",
  "robos:repository": "github.com/acme-org/puzzle-quest-mobile",
  "robos:technology": "C# / Unity 6",
  "robos:gameEngine": "Unity",
  "robos:platform": ["iOS", "Android"],
  "robos:bundleId": "com.robos.game.puzzlequest",
  "schema:gamePlatform": ["iOS", "Android"],
  "schema:playMode": "SinglePlayer",
  "robos:ownerTeam": "urn:robos:team:core-platform"
}
```

### SHACL Constraints (`MobileGameShape`)
- **`dcterms:title`**: Game title (minCount: 1)
- **`robos:repository`**: Canonical Git repository URL (minCount: 1)
- **`robos:technology`**: Runtime technology stack (minCount: 1)
- **`robos:gameEngine`**: Engine (Unity, Unreal Engine, Godot) (minCount: 1)
- **`robos:platform`**: Mobile platforms (iOS, Android) (minCount: 1)

---

## Scaffolding Games via RobOS App Wizard

1. Open **RobOS App Wizard** (`packages/app-wizard`).
2. Select **PC Game** (🎮) or **Mobile Game** (🕹️).
3. Specify engine, repository slug, and platform targets.
4. Click **Generate Scaffolding** to produce build configuration templates, `dev-setup.sh`, and `.robos/packages.yaml` registration.

---

## Next Steps

- **[Develop a New App Guide]({{ site.baseurl }}{% link new-app-wizard.md %})**: Learn about all 9 multi-app archetypes.
- **[RobOS Big Wins]({{ site.baseurl }}{% link big-wins.md %})**: Discover core architectural innovations and strategic advantages.
- **[💡 Explore the Ideas Store on GitHub](https://github.com/nddipiazza/robos/tree/main/docs/ideas)**: View raw idea dumps, community feature proposals, and structured architecture specs.

