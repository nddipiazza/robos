---
title: About
layout: default
nav_order: 9
permalink: /about.html
---

# About
{: .no_toc }

What RobOS is, how it is licensed, and where the code and the community are.
{: .fs-6 }

## What RobOS is

RobOS is an open-source set of Electron desktop apps and shared libraries for the software development lifecycle. The apps cover planning tasks, running coding agents on them, and reviewing the results with evidence. [A day with RobOS]({{ site.baseurl }}{% link day-in-the-life.md %}) shows one task going through that flow, and the [Apps]({{ site.baseurl }}{% link apps.md %}) page lists every app.

The repository also contains:

- A knowledge graph stored as plain files under `.robos/`.
- An installer app and scripts that build a RobOS appliance image, which you can install from a USB drive or run in QEMU. See [Get started]({{ site.baseurl }}{% link getting-started.md %}).
- Instruction files for coding agents: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` and `ANTIGRAVITY.md`, and RobOS skills under `plugins/robos/skills/`.

![Four AI coding assistants contributing to RobOS through shared protocols, skills and validation gates]({{ '/assets/images/multi-agent-co-creation.jpg' | relative_url }}){: .robos-zoomable-img }
*Concept diagram from the original design docs. The text on this page says what is built today.*

## The name

RobOS is pronounced "row-bose", rhyming with "rose". [RobOS Voice]({{ site.baseurl }}{% link voice-prompt.md %}) rewrites "RobOS" to "Row Bose" before it speaks. The project README says the name comes from the robot Robo in the game Chrono Trigger. Chrono Trigger and Robo belong to Square Enix. RobOS is an independent project and is not affiliated with or endorsed by Square Enix.

![Tribute artwork of the robot Robo standing in a lush forest]({{ '/assets/images/robo-chrono-trigger.jpg' | relative_url }}){: .robos-zoomable-img }
*Original tribute artwork of Robo, the character the name comes from. Robo and Chrono Trigger belong to Square Enix.*

## License

The repository is licensed under the Apache License 2.0. The full text is in [`LICENSE`](https://github.com/nddipiazza/robos/blob/main/LICENSE).

## Code and community

- [GitHub repository](https://github.com/nddipiazza/robos): source, releases and the `docs/` folder for this site.
- [GitHub issues](https://github.com/nddipiazza/robos/issues): bug reports.
- [GitHub Discussions](https://github.com/nddipiazza/robos/discussions): proposals and questions.
- [Discord](https://discord.gg/6PjxzkHujE): chat with other users and contributors.
- [Contributing guide](https://github.com/nddipiazza/robos/blob/main/CONTRIBUTING.md): how to propose and submit changes.
- [Ideas](https://github.com/nddipiazza/robos/tree/main/docs/ideas): feature ideas and specifications.
