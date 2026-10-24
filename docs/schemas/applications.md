---
title: "Applications (robos.apps)"
layout: default
parent: Schemas
nav_order: 4
has_children: true
permalink: /schemas/applications.html
description: "Front-end, desktop, console and mobile applications, games, libraries, web routes, CLI commands and voice commands."
---

# Applications (robos.apps)
{: .no_toc }

Front-end, desktop, console and mobile applications, games, libraries, web routes, CLI commands and voice commands.
{: .fs-6 }

| | |
|---|---|
| Package id | `applications` |
| Namespace | `robos.apps` |
| Package file | `.robos/kgraphs/applications/package.jsonld` |
| Classes documented | 11 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Shape | Required properties |
|---|---|---|
| [Desktop App (`robos:DesktopApp`)]({{ '/schemas/applications/desktop-app.html' | relative_url }}) | `urn:robos:shape:DesktopAppShape` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:desktopFramework` |
| [Console App (`robos:ConsoleApp`)]({{ '/schemas/applications/console-app.html' | relative_url }}) | `urn:robos:shape:ConsoleAppShape` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:cliCommand` |
| [Mobile App (`robos:MobileApp`)]({{ '/schemas/applications/mobile-app.html' | relative_url }}) | `urn:robos:shape:MobileAppShape` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:platform` |
| [Library (`robos:Library`)]({{ '/schemas/applications/library.html' | relative_url }}) | `urn:robos:shape:LibraryShape` | `dcterms:title`, `robos:repository`, `robos:technology` |
| [Front End App (`robos:FrontEndApp`)]({{ '/schemas/applications/front-end-app.html' | relative_url }}) | `urn:robos:shape:FrontEndAppShape` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:frontendFramework` |
| [PC Game (`robos:PCGame`)]({{ '/schemas/applications/pc-game.html' | relative_url }}) | `urn:robos:shape:PCGameShape` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:gameEngine`, `robos:targetPlatform` |
| [Mobile Game (`robos:MobileGame`)]({{ '/schemas/applications/mobile-game.html' | relative_url }}) | `urn:robos:shape:MobileGameShape` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:gameEngine`, `robos:platform` |
| [Web Route (`robos:WebRoute`)]({{ '/schemas/applications/web-route.html' | relative_url }}) | `urn:robos:shape:WebRouteShape` | `dcterms:title`, `robos:routePath`, `robos:app` |
| [CLI Command (`robos:CLICommand`)]({{ '/schemas/applications/cli-command.html' | relative_url }}) | `urn:robos:shape:CLICommandShape` | `dcterms:title`, `robos:commandName`, `robos:app` |
| [CLI Flag (`robos:CLIFlag`)]({{ '/schemas/applications/cli-flag.html' | relative_url }}) | `urn:robos:shape:CLIFlagShape` | `dcterms:title`, `robos:flagName`, `robos:command` |
| [Voice Command (`robos:VoiceCommand`)]({{ '/schemas/applications/voice-command.html' | relative_url }}) | `urn:robos:shape:VoiceCommandShape` | `dcterms:title`, `robos:commandMatcher`, `robos:targetType`, `robos:targetId` |
