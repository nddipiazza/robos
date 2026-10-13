---
title: "Games: Rules"
layout: default
parent: Schemas
nav_order: 9
has_children: true
permalink: /schemas/game.html
---

# Games: Rules (robos.game)
{: .no_toc }

Rules-engine building blocks shared by games: games, classes, items, spells and monsters.
{: .fs-6 }

| Detail | Value |
|---|---|
| Package id | `game` |
| Namespace | `robos.game` |
| Package file | `.robos/kgraphs/game/package.jsonld` |
| Classes documented | 5 |

This package is one of the game packages. See also [Games: cRPG]({{ '/schemas/crpg.html' | relative_url }}) and [Games: Tabletop]({{ '/schemas/tabletop-game.html' | relative_url }}), the Infinity Engine notes under [Game packages]({{ '/knowledge-graph.html#game-packages' | relative_url }}) and the games themselves in [Game development]({{ '/game-development.html' | relative_url }}).

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Node type | Required properties |
|---|---|---|
| [Game]({{ '/schemas/game/game.html' | relative_url }}) | `robos:Game` | `dcterms:title`, `robos:ruleset` |
| [Game Class]({{ '/schemas/game/game-class.html' | relative_url }}) | `robos:GameClass` | `dcterms:title` |
| [Game Monster]({{ '/schemas/game/game-monster.html' | relative_url }}) | `robos:GameMonster` | `dcterms:title` |
| [Game Item]({{ '/schemas/game/game-item.html' | relative_url }}) | `robos:GameItem` | `dcterms:title` |
| [Game Spell]({{ '/schemas/game/game-spell.html' | relative_url }}) | `robos:GameSpell` | `dcterms:title` |
