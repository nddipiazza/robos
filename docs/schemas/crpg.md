---
title: "Games: cRPG"
layout: default
parent: Schemas
nav_order: 10
has_children: true
permalink: /schemas/crpg.html
---

# Games: cRPG (robos.crpg)
{: .no_toc }

Party-based tactical cRPG content: abilities, campaigns, map transitions, game events and story flows.
{: .fs-6 }

| Detail | Value |
|---|---|
| Package id | `crpg` |
| Namespace | `robos.crpg` |
| Package file | `.robos/kgraphs/crpg/package.jsonld` |
| Classes documented | 6 |

This package is one of the game packages. See also [Games: Rules]({{ '/schemas/game.html' | relative_url }}) and [Games: Tabletop]({{ '/schemas/tabletop-game.html' | relative_url }}), the Infinity Engine notes under [Game packages]({{ '/knowledge-graph.html#game-packages' | relative_url }}) and the games themselves in [Game development]({{ '/game-development.html' | relative_url }}).

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Node type | Required properties |
|---|---|---|
| [CRPG Ability]({{ '/schemas/crpg/crpg-ability.html' | relative_url }}) | `robos:CRPGAbility` | `dcterms:title`, `robos:actionType`, `robos:recharge` |
| [CRPG Story Flow]({{ '/schemas/crpg/crpg-story-flow.html' | relative_url }}) | `robos:CRPGStoryFlow` | `robos:rootNodeId`, `robos:storyNodes` |
| [CRPG Story Node]({{ '/schemas/crpg/crpg-story-node.html' | relative_url }}) | `robos:CRPGStoryNode` | `dcterms:title`, `robos:nodeType`, `robos:act` |
| [CRPG Game Event]({{ '/schemas/crpg/crpg-game-event.html' | relative_url }}) | `robos:CRPGGameEvent` | `dcterms:title`, `robos:eventType`, `robos:infinityInteraction` |
| [CRPG Campaign]({{ '/schemas/crpg/crpg-campaign.html' | relative_url }}) | `robos:CRPGCampaign` | `dcterms:title`, `robos:startingMap`, `robos:maps` |
| [CRPG Map Transition]({{ '/schemas/crpg/crpg-map-transition.html' | relative_url }}) | `robos:CRPGMapTransition` | `robos:targetMap`, `robos:targetSpawn` |
