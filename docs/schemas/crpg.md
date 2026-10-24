---
title: "cRPG (robos.crpg)"
layout: default
parent: Schemas
nav_order: 10
has_children: true
permalink: /schemas/crpg.html
description: "Party-based tactical cRPG content: abilities, campaigns, map transitions, game events and story flows."
---

# cRPG (robos.crpg)
{: .no_toc }

Party-based tactical cRPG content: abilities, campaigns, map transitions, game events and story flows.
{: .fs-6 }

| | |
|---|---|
| Package id | `crpg` |
| Namespace | `robos.crpg` |
| Package file | `.robos/kgraphs/crpg/package.jsonld` |
| Classes documented | 6 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Shape | Required properties |
|---|---|---|
| [CRPG Ability (`robos:CRPGAbility`)]({{ '/schemas/crpg/crpg-ability.html' | relative_url }}) | `urn:robos:shape:CRPGAbilityShape` | `dcterms:title`, `robos:actionType`, `robos:recharge` |
| [CRPG Story Flow (`robos:CRPGStoryFlow`)]({{ '/schemas/crpg/crpg-story-flow.html' | relative_url }}) | `urn:robos:shape:CRPGStoryFlowShape` | `robos:rootNodeId`, `robos:storyNodes` |
| [CRPG Story Node (`robos:CRPGStoryNode`)]({{ '/schemas/crpg/crpg-story-node.html' | relative_url }}) | `urn:robos:shape:CRPGStoryNodeShape` | `dcterms:title`, `robos:nodeType`, `robos:act` |
| [CRPG Game Event (`robos:CRPGGameEvent`)]({{ '/schemas/crpg/crpg-game-event.html' | relative_url }}) | `urn:robos:shape:CRPGGameEventShape` | `dcterms:title`, `robos:eventType`, `robos:infinityInteraction` |
| [CRPG Campaign (`robos:CRPGCampaign`)]({{ '/schemas/crpg/crpg-campaign.html' | relative_url }}) | `urn:robos:shape:CRPGCampaignShape` | `dcterms:title`, `robos:startingMap`, `robos:maps` |
| [CRPG Map Transition (`robos:CRPGMapTransition`)]({{ '/schemas/crpg/crpg-map-transition.html' | relative_url }}) | `urn:robos:shape:CRPGMapTransitionShape` | `robos:targetMap`, `robos:targetSpawn` |
