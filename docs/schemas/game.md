---
title: "Game Rules (robos.game)"
layout: default
parent: Schemas
nav_order: 9
has_children: true
permalink: /schemas/game.html
---

# Game Rules (robos.game)
{: .no_toc }

Rules-engine building blocks shared by games: games, classes, items, spells and monsters.
{: .fs-6 }

| | |
|---|---|
| Package id | `game` |
| Namespace | `robos.game` |
| Package file | `.robos/kgraphs/game/package.jsonld` |
| Classes documented | 5 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Shape | Required properties |
|---|---|---|
| [Game (`robos:Game`)]({{ '/schemas/game/game.html' | relative_url }}) | `urn:robos:shape:GameShape` | `dcterms:title`, `robos:ruleset` |
| [Game Class (`robos:GameClass`)]({{ '/schemas/game/game-class.html' | relative_url }}) | `urn:robos:shape:GameClassShape` | `dcterms:title` |
| [Game Monster (`robos:GameMonster`)]({{ '/schemas/game/game-monster.html' | relative_url }}) | `urn:robos:shape:GameMonsterShape` | `dcterms:title` |
| [Game Item (`robos:GameItem`)]({{ '/schemas/game/game-item.html' | relative_url }}) | `urn:robos:shape:GameItemShape` | `dcterms:title` |
| [Game Spell (`robos:GameSpell`)]({{ '/schemas/game/game-spell.html' | relative_url }}) | `urn:robos:shape:GameSpellShape` | `dcterms:title` |
