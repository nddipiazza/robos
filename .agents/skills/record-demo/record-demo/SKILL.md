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
