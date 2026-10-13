---
title: "Tabletop Game (robos.tabletop)"
layout: default
parent: Schemas
nav_order: 11
has_children: true
permalink: /schemas/tabletop-game.html
---

# Tabletop Game (robos.tabletop)
{: .no_toc }

Tabletop dungeon-crawler content: heroes, monsters, summons, quest maps, turn steps and AI directives.
{: .fs-6 }

| | |
|---|---|
| Package id | `tabletop-game` |
| Namespace | `robos.tabletop` |
| Package file | `.robos/kgraphs/tabletop-game/package.jsonld` |
| Classes documented | 12 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Shape | Required properties |
|---|---|---|
| [Tabletop Game (`robos:TabletopGame`)]({{ '/schemas/tabletop-game/tabletop-game.html' | relative_url }}) | `urn:robos:shape:TabletopGameShape` | `dcterms:title`, `robos:ruleset`, `robos:gridDimensions` |
| [Tabletop Hero (`robos:TabletopHero`)]({{ '/schemas/tabletop-game/tabletop-hero.html' | relative_url }}) | `urn:robos:shape:TabletopHeroShape` | `dcterms:title`, `robos:bodyPoints`, `robos:mindPoints`, `robos:attackDice`, `robos:defendDice` |
| [Tabletop Monster (`robos:TabletopMonster`)]({{ '/schemas/tabletop-game/tabletop-monster.html' | relative_url }}) | `urn:robos:shape:TabletopMonsterShape` | `dcterms:title`, `robos:bodyPoints`, `robos:attackDice`, `robos:defendDice`, `robos:movementSquares` |
| [Tabletop Summon (`robos:TabletopSummon`)]({{ '/schemas/tabletop-game/tabletop-summon.html' | relative_url }}) | `urn:robos:shape:TabletopSummonShape` | `dcterms:title`, `robos:summoner`, `robos:bodyPoints`, `robos:mindPoints`, `robos:attackDice`, `robos:defendDice`, `robos:movementSquares` |
| [Tabletop Quest Map (`robos:TabletopQuestMap`)]({{ '/schemas/tabletop-game/tabletop-quest-map.html' | relative_url }}) | `urn:robos:shape:TabletopQuestMapShape` | `dcterms:title`, `robos:startingSpawn` |
| [Tabletop Map Configuration (`robos:TabletopMapConfiguration`)]({{ '/schemas/tabletop-game/tabletop-map-configuration.html' | relative_url }}) | `urn:robos:shape:TabletopMapConfigurationShape` | `dcterms:title`, `robos:gridDimensions` |
| [Tabletop Turn DAG (`robos:TabletopTurnDAG`)]({{ '/schemas/tabletop-game/tabletop-turn-dag.html' | relative_url }}) | `urn:robos:shape:TabletopTurnDAGShape` | `dcterms:title`, `robos:rootStepId`, `robos:turnSteps` |
| [Tabletop Turn Step (`robos:TabletopTurnStep`)]({{ '/schemas/tabletop-game/tabletop-turn-step.html' | relative_url }}) | `urn:robos:shape:TabletopTurnStepShape` | `dcterms:title`, `robos:stepType` |
| [Tabletop AI Engine (`robos:TabletopAIEngine`)]({{ '/schemas/tabletop-game/tabletop-ai-engine.html' | relative_url }}) | `urn:robos:shape:TabletopAIEngineShape` | `dcterms:title`, `robos:engineId`, `robos:role`, `robos:controllerModes`, `robos:decisionPipeline` |
| [Tabletop AI Directive (`robos:TabletopAIDirective`)]({{ '/schemas/tabletop-game/tabletop-ai-directive.html' | relative_url }}) | `urn:robos:shape:TabletopAIDirectiveShape` | `robos:controller` |
| [Tabletop Combatant (`robos:TabletopCombatant`)]({{ '/schemas/tabletop-game/tabletop-combatant.html' | relative_url }}) | `urn:robos:shape:TabletopCombatantShape` | `robos:actorId` |
| [Tabletop AI Command (`robos:TabletopAICommand`)]({{ '/schemas/tabletop-game/tabletop-ai-command.html' | relative_url }}) | `urn:robos:shape:TabletopAICommandShape` | `robos:action` |
