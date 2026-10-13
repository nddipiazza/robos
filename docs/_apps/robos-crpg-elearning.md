---
title: "cRPG Masterclass"
package: robos-crpg-elearning
category: learning
icon: robos-crpg-elearning.svg
summary: "Launcher that opens the eLearning Hub on the tactical cRPG course (D&D 5e rules and Godot 4)."
description: "A thin wrapper: it starts robos-elearning with --course=robos-crpg. The course content lives in the learning knowledge graph."
---

cRPG Masterclass has no interface of its own. Its `main.js` adds `--course=robos-crpg` to the command line, if no `--course=` is given, and then loads [RobOS eLearning Hub]({{ '/apps/robos-elearning/' | relative_url }}). Everything you see, including lab checklists, quizzes, the certificate and Editor Mode, is the eLearning Hub.

## The course

The course is "Tactical cRPG Architecture: D&D 5e SRD & Godot 4 Infinity Engine Masterclass", defined in `.robos/kgraphs/learning/package.jsonld`. It is marked Advanced, 60 minutes, with five modules:

1. D&D 5e ruleset and mathematical action economy.
2. Godot 4.3 engine runtime and 2.5D isometric architecture.
3. Open-source asset harvesting and an Infinity Engine style HUD.
4. An autonomous AI agent and headless BDD verification.
5. Knowledge-graph-first game development (`.robos/kgraphs/crpg`).

## Run it

Launch **cRPG Masterclass** from the app launcher. The `.desktop` file runs `electron /usr/local/share/robos/robos-crpg-elearning/main.js`, so the package expects `robos-elearning` and `robos-graph` to be installed beside it.
