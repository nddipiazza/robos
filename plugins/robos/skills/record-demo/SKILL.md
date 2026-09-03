---
name: record-demo
description: Capture an automated, text-narrated walkthrough video of a RobOS app on localhost (Docker/Xvfb) with on-screen text narration and WebVTT captions.
---

# Record a Text-Narrated Demo Video of a RobOS App

Capture a full text-narrated walkthrough demo of a RobOS Electron app on **localhost** using containerized Docker / Xvfb virtual framebuffers. Produces a final WebM video with on-screen text narration cards, element callout badges, and WebVTT captions.

> [!IMPORTANT]
> - **No VM Required & No Host Popups**: Demo video capture runs directly on localhost inside the isolated Docker test container (`./scripts/e2e-container.sh`) or local Xvfb framebuffer (`xvfb-run`). Never allow windows to pop up on the host desktop.
> - **Text-Only Step Narration**: E2E verification videos use on-screen text narration banners, targeted pointer callouts, and synced WebVTT captions to clearly explain what the test is doing at each step. No audio voice tracks are needed.

---

## Input

`$ARGUMENTS` — `<app-id>` optionally followed by a free-form description of what to demonstrate.

---

## Prerequisites

- `ffmpeg` installed locally (`/usr/bin/ffmpeg` or inside Docker container)
- `Xvfb` / `xvfb-run` for headless virtual display execution

---

## Steps

### 0. Verify Selectors & Design Cues
- Target **1–2 minutes total** (60–120 seconds) with responsive pacing
- Max **6–10 cues** per demo
- `minHold` per cue: **2000–4000 ms** (sufficient for reading on-screen text callouts)
- Confirm DOM selectors exist in `packages/<app-id>/renderer/` before running.

> [!CAUTION]
> ### THE CARDINAL LAW OF E2E DEMOS: 100% VISUAL GROUNDING
> **NEVER write a narration or click action that refers to a concept, file, or feature unless that exact item is rendered and visually visible on screen!**
> 1. **No Phantom Narrations**: If the narration talks about `topology.yaml` or `teams.yaml`, the UI MUST be rendering that file or a dedicated card for it—NEVER point to an unrelated search bar or generic table while narrating about a different concept.
> 2. **Explicit View / Tab Activation First**: Before interacting with components within a specific panel or tab, your script MUST explicitly click the tab button first (e.g. `#tab-btn-gitops`, `#tab-btn-video`), allowing the renderer to paint the active view before targeting its child elements.
> 3. **Explicit Semantic IDs**: Prefer explicit element IDs (`#gitops-file-topology`, `#btn-probe-acme-tax`, `#chapter-item-3`) over generic pseudo-selectors (`tr:first-child`, `.card:first-child`) to ensure pointer ripples and callouts land precisely on the intended UI element.
> 4. **Async State Settle**: When triggering async operations (e.g. running an EDD cycle, probing a mock stub, or running a schema validation), include adequate `minHold` (3000ms+) or an intermediate settle step so the DOM is fully rendered before inspecting result cards.
> 5. **Screenshot Extraction Timestamp**: When capturing preview frame screenshots with `ffmpeg -ss <timestamp>`, select a timestamp (e.g. `-ss 00:00:15`) during the active demonstration when all cards and data tables are populated, never `-ss 00:00:00`.

### 1. Check or Create Demo Script
Follow template in `packages/robos-test/demos/<app-id>-demo.js`.

```javascript
'use strict';
const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'We open the application dashboard to inspect the active state.',
    minHold: 3000,
  },
  {
    narration: 'The user searches for the target workspace and selects it.',
    target: '#search-input',
    action: 'type',
    value: 'RobOS Core',
    callout: 'Filter workspaces',
    minHold: 3000,
  },
  // ... cues ...
];

runDemo({
  slug: '<slug>',
  appId: '<app-id>',
  windowTitle: '<Window Title>',
  scenario: scenarios['all-good'],
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });
```

### 2. Run Demo Recording on Localhost

#### In Docker E2E Container (Recommended):
```bash
./scripts/e2e-container.sh node packages/robos-test/demos/<app-id>-demo.js
```

#### On Local Machine (Xvfb Headless Display):
```bash
xvfb-run -a -s "-screen 0 1920x1080x24" node packages/robos-test/demos/<app-id>-demo.js
```

### 3. Deliverables & Archiving

The demo runner automatically compiles and archives all walkthrough deliverables:

#### Local Test Run Directory:
- **Final Video**: `packages/robos-test/run/demos/<slug>/<slug>-final.webm`
- **Captions / Transcript**: `packages/robos-test/run/demos/<slug>/<slug>.vtt`

#### Persistent RobOS Walkthrough Archive:
- **Latest Archive**: `~/.robos/development/walkthroughs/<slug>/`
  - `<slug>-final.webm` (video)
  - `<slug>.vtt` (captions)
  - `walkthrough.md` (summary, metadata, and step transcript table)
- **Historical Runs**: `~/.robos/development/walkthroughs/<slug>/history/<timestamp>/`

---

## Verification

- Inspect the generated `.webm` video to ensure smooth transitions and clear on-screen text callouts.
- Verify that every step in the scenario executed and passed without throwing errors.
- Confirm deliverables are archived in `~/.robos/development/walkthroughs/<slug>/`.
