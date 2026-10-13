---
title: Applications
layout: default
parent: Schemas
nav_order: 4
has_children: true
permalink: /schemas/applications.html
---

# Applications (robos.apps)
{: .no_toc }

Front-end, desktop, console and mobile applications, games, libraries, web routes, CLI commands and voice commands.
{: .fs-6 }

| Detail | Value |
|---|---|
| Package id | `applications` |
| Namespace | `robos.apps` |
| Package file | `.robos/kgraphs/applications/package.jsonld` |
| Classes documented | 11 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Node type | Required properties |
|---|---|---|
| [Desktop App]({{ '/schemas/applications/desktop-app.html' | relative_url }}) | `robos:DesktopApp` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:desktopFramework` |
| [Console App]({{ '/schemas/applications/console-app.html' | relative_url }}) | `robos:ConsoleApp` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:cliCommand` |
| [Mobile App]({{ '/schemas/applications/mobile-app.html' | relative_url }}) | `robos:MobileApp` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:platform` |
| [Library]({{ '/schemas/applications/library.html' | relative_url }}) | `robos:Library` | `dcterms:title`, `robos:repository`, `robos:technology` |
| [Front End App]({{ '/schemas/applications/front-end-app.html' | relative_url }}) | `robos:FrontEndApp` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:frontendFramework` |
| [PC Game]({{ '/schemas/applications/pc-game.html' | relative_url }}) | `robos:PCGame` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:gameEngine`, `robos:targetPlatform` |
| [Mobile Game]({{ '/schemas/applications/mobile-game.html' | relative_url }}) | `robos:MobileGame` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:gameEngine`, `robos:platform` |
| [Web Route]({{ '/schemas/applications/web-route.html' | relative_url }}) | `robos:WebRoute` | `dcterms:title`, `robos:routePath`, `robos:app` |
| [CLI Command]({{ '/schemas/applications/cli-command.html' | relative_url }}) | `robos:CLICommand` | `dcterms:title`, `robos:commandName`, `robos:app` |
| [CLI Flag]({{ '/schemas/applications/cli-flag.html' | relative_url }}) | `robos:CLIFlag` | `dcterms:title`, `robos:flagName`, `robos:command` |
| [Voice Command]({{ '/schemas/applications/voice-command.html' | relative_url }}) | `robos:VoiceCommand` | `dcterms:title`, `robos:commandMatcher`, `robos:targetType`, `robos:targetId` |
