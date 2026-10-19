---
title: "IntelliJ IDEA Bridge"
package: intellij-idea
category: code-review
summary: "A simulated IntelliJ window that answers the RobOS IDE plugin's HTTP routes on port 63343 with in-memory data, for demos and tests."
description: "This package is not IntelliJ. It is an Electron mock that serves the same /robos/* routes as the real plugin in plugins/intellij-idea, and shows a canned Acme Petshop task workspace."
icon: intellij-idea.svg
---

The package named `intellij-idea` is a stand-in for the IDE. It lets the [IDE Bridge MCP Server]({{ '/apps/ide-bridge-mcp/' | relative_url }}), the demo scripts and the tests exercise the IDE protocol on a machine without IntelliJ installed. The real integration is the Kotlin plugin in `plugins/intellij-idea`.

{: .note }
If a real IntelliJ with the plugin is running, both want `127.0.0.1:63343`. Run only one of them. This mock logs "Warning on server listen" and carries on if the port is taken, so a window may be open that is not receiving requests.

## What it serves

An HTTP server on `127.0.0.1:63343` handles these routes with in-memory state:

| Route | Behavior |
|---|---|
| `/robos/health` | Reports status OK, "IntelliJ IDEA Ultimate 2026.1", plugin `com.robos.intellij` |
| `/robos/open-file`, `/robos/set-breakpoint` | Forwards the request to the window; a breakpoint fires the registered webhooks with a sample `breakpoint_hit` event |
| `/robos/run-config/create`, `run`, `stop` (and `/robos/run`, `/robos/stop`) | Keeps run configurations in memory. `pass:<path>` values in `env` are replaced by a `[RESOLVED_GPG_PASS:<path>]` placeholder; no password store is read |
| `/robos/webhook/register` | Remembers a URL to post breakpoint events to |
| `/robos/debug/thread-state` | A fixed suspended thread at `PetService.java:48` |
| `/robos/workspace/ephemeral`, `/robos/workspace/destroy` | Creates and removes an in-memory workspace record |

Anything else returns 404. State is lost when the app closes. It starts with one run configuration, "Debug PetServiceTest".

## The window

The window is titled "IntelliJ IDEA Ultimate 2026.1 - robos-java-service" and shows a canned page, "RobOS Task Workspace & IDE - Acme Petshop": a sprint backlog (PET-101 to PET-105), the details of PET-105, and the buttons **Refine Plan**, **Approve & Execute Plan** and **Launch Task Workspace (Auto-Provision & Run Reproduction)**. The launch button plays a scripted sequence (branch checked out, secrets injected, services active, breakpoint hit). The steps are timed animations, not real operations.

```bash
electron packages/intellij-idea
```

Source: [`packages/intellij-idea`](https://github.com/nddipiazza/robos/tree/main/packages/intellij-idea). For the real plugin see `plugins/intellij-idea/README.md`.
