---
title: "Desktop Agents Viewer"
package: desktop-agents
category: ai-agents
summary: "A prototype viewer that mocks up watching several agents on their own virtual desktops."
description: "Desktop Agents Viewer draws three simulated agent screens on canvases from hardcoded data. It does not yet stream real desktops."
icon: desktop-agents.svg
---

Desktop Agents Viewer is a prototype of a console for watching agents that each work on their own virtual display (`:10`, `:11`, `:12` in the sample data).

{: .note }
The three streams, their frame rates, CPU and memory figures, and the "Input Latency" and "Stream Framerate" stat cards are constants in `preload.js` and `renderer/index.html`. The screens are drawn with the canvas API; nothing is captured from a display, and the `streamUrl` values (`http://localhost:19160/stream` and so on) are not served by anything in this package.

## What is on screen

- **Grid View** shows one card per sample agent (user name, display, role, RAM). Click a card to open it.
- **Single Stream** shows one agent larger, with a simulated terminal and IDE and a proof-of-work bar. **Exit Focus** returns to the grid.
- **Take Manual Control** toggles a banner that says keyboard and mouse forwarding is active. No input is forwarded.

## Running it

```bash
electron packages/desktop-agents
```

Source: [`packages/desktop-agents`](https://github.com/nddipiazza/robos/tree/main/packages/desktop-agents).
