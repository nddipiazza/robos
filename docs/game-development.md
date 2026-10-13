---
title: Game development
layout: default
parent: Building apps
grand_parent: Build on RobOS
nav_order: 4
---

# Game development
{: .no_toc }

What RobOS contains for games today: two Godot projects you can run and read, editor apps for their content, graph packages and shapes for game projects, and six Task Planner templates. The App Wizard does not scaffold a game project yet.
{: .fs-6 }

## Games in this repository

Both are Godot 4.3 projects (`config/features` in each `project.godot` lists 4.3 and the GL Compatibility renderer).

| Path | Game | Notes |
|:---|:---|:---|
| `games/crpg-realm` | Realm of Heroes: A Night Without Memory | A party-based cRPG with D&D 5e SRD rules. It has its own `AGENTS.md` describing the test layers. |
| `games/tabletop-rpg` | RobOS Tabletop RPG: HeroQuest | A HeroQuest-style turn-based dungeon crawler. Its content is modeled in the `tabletop-game` graph package. `play.sh` accepts options such as `--cartridge`, `--quest`, `--demo` and `--hard`. |

Both have a launcher script. It finds Godot from `GODOT_BIN`, then `godot4` or `godot` on your `PATH` (they also check `~/apps/godot4`, and the tabletop script checks `~/.local/bin/godot`):

```bash
GODOT_BIN=/path/to/godot games/crpg-realm/play.sh
games/tabletop-rpg/play.sh
```

The scripts exit with "Godot 4 binary not found" if none of these exists.

The cRPG's tests run from `games/crpg-realm` and need Python with `behave` installed. The fast layer runs headless:

```bash
CRPG_MODE=backend python3 -m behave tests/e2e/features/engine
```

Without `CRPG_MODE=backend` the same features run with video and on-screen overlays. The test layers, the Infinity AI scenario engine and the environment variables are described in [`games/crpg-realm/AGENTS.md`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/AGENTS.md). For the project write-ups, see [Tactical cRPG]({{ '/projects/crpg-realm/' | relative_url }}) and [Tabletop RPG]({{ '/projects/tabletop-rpg/' | relative_url }}), or the list on [Projects]({{ site.baseurl }}{% link projects.md %}).

## Editor apps

| App | What it edits |
|:---|:---|
| [cRPG Editor]({{ '/apps/crpg-editor/' | relative_url }}) | Campaigns, characters, inventory and blockmaps for the cRPG. |
| [Tabletop Studio]({{ '/apps/robos-tabletop/' | relative_url }}) | HeroQuest and tabletop RPG cartridges, through a form editor. |
| [Tabletop Blockmap Creator]({{ '/apps/tabletop-blockmap-creator/' | relative_url }}) | Grid tile size and offsets for a dungeon image, plus corridors and rooms drawn over it. |

## Game packages in the knowledge graph

`.robos/kgraph.yaml` registers four game-related packages under `.robos/kgraphs/`: `game` (a shared gaming and RPG-rules ontology), `crpg` (the cRPG's content nodes), `tabletop-game` (the HeroQuest content) and `infinity-engine` (notes on the Infinity Engine architecture the cRPG follows).

The `crpg` package holds the node `urn:robos:crpg:game:realm-of-heroes`, typed `robos:PCGame` and `schema:VideoGame`. It is the only `robos:PCGame` node in the graph packages; the Space Raiders and Puzzle Quest entries in `.robos/packages.yaml` are sample data.

Two SHACL shapes cover game projects. Each property below has `minCount: 1`:

| Shape | Required properties |
|:---|:---|
| `PCGameShape` (`robos:PCGame`) | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:gameEngine`, `robos:targetPlatform` |
| `MobileGameShape` (`robos:MobileGame`) | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:gameEngine`, `robos:platform` |

## Planning a game

Task Planner has six templates in its Game Development category, defined in `packages/task-planner/lib/default-templates.js`. They produce a plan of tasks; they do not create a project.

- **Plan to Create a Tactical cRPG Game (Godot 4 Infinity Engine)**
- **Plan to Create a Godot Game**
- **Plan to Create a Unity 6 PC/Console Game**
- **Plan to Create a Unity 6 Mobile Game**
- **Plan to Create an Unreal Engine 5 PC Action Game**
- **Plan to Create a Rust Bevy ECS Game**

See [Task Planner]({{ '/apps/task-planner/' | relative_url }}).

## Not built yet

- The wizard has a **PC Video Game** card but no game template. It produces the generic web or Node.js scaffold described in [New app wizard]({{ site.baseurl }}{% link new-app-wizard.md %}).
- There is no Mobile Game card in the creation wizard. The import wizard classifies a folder containing `project.godot` or an Unreal `*.uproject` as a PC Game (a Mobile Game if the folder name contains "mobile"), and a React Native project whose folder name contains "game" as a Mobile Game. It goes by file and folder names only.
- Apart from the planning templates above, RobOS has no Unreal Engine, Unity or Bevy support: no scaffold, build or export tooling.
