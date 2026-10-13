---
title: "Games: Tabletop"
layout: default
parent: Schemas
nav_order: 11
has_children: true
permalink: /schemas/tabletop-game.html
---

# Games: Tabletop (robos.tabletop)
{: .no_toc }

Tabletop dungeon-crawler content: heroes, monsters, summons, quest maps, turn steps and AI directives.
{: .fs-6 }

| Detail | Value |
|---|---|
| Package id | `tabletop-game` |
| Namespace | `robos.tabletop` |
| Package file | `.robos/kgraphs/tabletop-game/package.jsonld` |
| Classes documented | 12 |

This package is one of the game packages. See also [Games: Rules]({{ '/schemas/game.html' | relative_url }}) and [Games: cRPG]({{ '/schemas/crpg.html' | relative_url }}), the Infinity Engine notes under [Game packages]({{ '/knowledge-graph.html#game-packages' | relative_url }}) and the games themselves in [Game development]({{ '/game-development.html' | relative_url }}).

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Node type | Required properties |
|---|---|---|
| [Tabletop Game]({{ '/schemas/tabletop-game/tabletop-game.html' | relative_url }}) | `robos:TabletopGame` | `dcterms:title`, `robos:ruleset`, `robos:gridDimensions` |
| [Tabletop Hero]({{ '/schemas/tabletop-game/tabletop-hero.html' | relative_url }}) | `robos:TabletopHero` | `dcterms:title`, `robos:bodyPoints`, `robos:mindPoints`, `robos:attackDice`, `robos:defendDice` |
| [Tabletop Monster]({{ '/schemas/tabletop-game/tabletop-monster.html' | relative_url }}) | `robos:TabletopMonster` | `dcterms:title`, `robos:bodyPoints`, `robos:attackDice`, `robos:defendDice`, `robos:movementSquares` |
| [Tabletop Summon]({{ '/schemas/tabletop-game/tabletop-summon.html' | relative_url }}) | `robos:TabletopSummon` | `dcterms:title`, `robos:summoner`, `robos:bodyPoints`, `robos:mindPoints`, `robos:attackDice`, `robos:defendDice`, `robos:movementSquares` |
| [Tabletop Quest Map]({{ '/schemas/tabletop-game/tabletop-quest-map.html' | relative_url }}) | `robos:TabletopQuestMap` | `dcterms:title`, `robos:startingSpawn` |
| [Tabletop Map Configuration]({{ '/schemas/tabletop-game/tabletop-map-configuration.html' | relative_url }}) | `robos:TabletopMapConfiguration` | `dcterms:title`, `robos:gridDimensions` |
| [Tabletop Turn DAG]({{ '/schemas/tabletop-game/tabletop-turn-dag.html' | relative_url }}) | `robos:TabletopTurnDAG` | `dcterms:title`, `robos:rootStepId`, `robos:turnSteps` |
| [Tabletop Turn Step]({{ '/schemas/tabletop-game/tabletop-turn-step.html' | relative_url }}) | `robos:TabletopTurnStep` | `dcterms:title`, `robos:stepType` |
| [Tabletop AI Engine]({{ '/schemas/tabletop-game/tabletop-ai-engine.html' | relative_url }}) | `robos:TabletopAIEngine` | `dcterms:title`, `robos:engineId`, `robos:role`, `robos:controllerModes`, `robos:decisionPipeline` |
| [Tabletop AI Directive]({{ '/schemas/tabletop-game/tabletop-ai-directive.html' | relative_url }}) | `robos:TabletopAIDirective` | `robos:controller` |
| [Tabletop Combatant]({{ '/schemas/tabletop-game/tabletop-combatant.html' | relative_url }}) | `robos:TabletopCombatant` | `robos:actorId` |
| [Tabletop AI Command]({{ '/schemas/tabletop-game/tabletop-ai-command.html' | relative_url }}) | `robos:TabletopAICommand` | `robos:action` |
