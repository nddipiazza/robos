---
name: e2e-driven-dev
description: Execute task development using an End-to-End Driven Development (EDD) workflow where narrated E2E tests and video walkthroughs guide and validate feature implementation.
---

# E2E-Driven Development (EDD) Skill

Perform feature development or bug fixing on a generic task using an **End-to-End Driven Development (EDD)** methodology. In this workflow, development begins by creating a narrated E2E test scenario that records video with neural voice narration (Piper TTS) and WebVTT captions. The test serves as both the executable specification and the user-facing verification artifact.

---

## When to Use

Use this skill when:
- The user requests building a new feature, flow, or bug fix using E2E-driven development (`/e2e-driven-dev` or `/do-e2e-driven-dev`).
- You need to deliver visual proof of feature completion accompanied by step-by-step spoken narration and synced captions.
- Implementing UI/UX workflows across any RobOS app (`dev-central`, `git-projects`, `task-board`, etc.).

---

## Input

`$ARGUMENTS` — `<app-id> "<task description or acceptance criteria>"`

Examples:
- `dev-central "Add sprint filter dropdown and show active sprint summary"`
- `git-projects "Add git worktree creation modal with branch selection"`
- `task-board "Add swimlane grouping by priority with drag-and-drop"`

---

## Workflow: The 5-Phase EDD Cycle

```
┌────────────────────────────────────────────────────────┐
│ 1. Spec & Script Design                                │
│    Define user story & narrated test script (cues)     │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ 2. Create Narrated E2E Test (Red Phase)                │
│    Write test in packages/robos-test/demos/<slug>-demo.js│
│    Run test -> verify it fails on missing feature      │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ 3. Implement Feature (Green Phase)                     │
│    Implement IPC handlers, preload APIs, renderer UI   │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ 4. Run Narrated E2E & Produce Video Artifact           │
│    Execute demo-runner -> record WebM + Piper TTS + VTT│
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ 5. Review & Verification Artifact                      │
│    Present final video, VTT transcript, and assertions │
└────────────────────────────────────────────────────────┘
```

---

## Detailed Procedures

### Phase 1 — Spec & Script Design

1. **Analyze Requirements**: Extract the user journey, UI controls, backend/IPC operations, and acceptance criteria.
2. **Design Test Script Cues**:
   Each step in the script must contain:
   - `narration`: Clear, natural English explanation of what the user is doing and what the app should display.
   - `js` / `action`: DOM manipulation, element interaction, or state assertion.
   - `minHold`: Display duration (2000–5000ms) matching the narration audio length.

---

### Phase 2 — Write the Narrated E2E Test Script

Create `packages/robos-test/demos/<app-id>-<feature-slug>-demo.js`:

```javascript
'use strict';
const path = require('path');
const { runDemo } = require('../lib/demo-runner');
const scenarios  = require('../lib/scenarios');

const SCRIPT = [
  {
    narration: 'We begin on the main dashboard to verify the new feature integration.',
    js: null,
    minHold: 4000,
  },
  {
    narration: 'The user opens the sprint filter dropdown to select the active sprint.',
    js: `(() => {
      const el = document.querySelector('#sprint-filter');
      if (el) el.click();
    })()`,
    minHold: 3500,
  },
  {
    narration: 'Selecting Sprint 24 filters the task cards and updates the sprint metrics banner.',
    js: `(() => {
      const option = document.querySelector('[data-sprint-id="sprint-24"]');
      if (option) option.click();
    })()`,
    minHold: 4000,
  },
  {
    narration: 'The active sprint cards are rendered with updated story point totals.',
    js: `(() => {
      const count = document.querySelectorAll('.task-card').length;
      console.log('Filtered task count:', count);
    })()`,
    minHold: 4500,
  },
];

runDemo({
  slug: '<app-id>-<feature-slug>',
  appId: '<app-id>',
  windowTitle: 'RobOS <App Name>',
  scenario: scenarios['all-good'],
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
```

---

### Phase 3 — Implement the Feature

Implement the application code across the standard RobOS layers:
1. **Preload (`packages/<app-id>/preload.js`)**: Expose IPC bindings via `contextBridge`.
2. **Main Process (`packages/<app-id>/main.js`)**: Register `ipcMain.handle()` handlers for data operations.
3. **Renderer HTML/CSS/JS (`packages/<app-id>/renderer/`)**: Add UI components adhering to RobOS dark theme (`--bg-primary: #0d1117`, `--accent: #00bcd4`).

---

### Phase 4 — Execute Narrated E2E & Generate Video

Run the narrated E2E test in the container or VM:

#### In Docker E2E Container:
```bash
./scripts/e2e-container.sh node packages/robos-test/demos/<app-id>-<feature-slug>-demo.js
```

#### On VM (or local dev environment):
```bash
node packages/robos-test/demos/<app-id>-<feature-slug>-demo.js
```

This pipeline automatically:
1. Synthesizes neural TTS voice audio for every narration cue using Piper.
2. Launches the Electron app inside the virtual display.
3. Records video with `ffmpeg` while executing each scripted action.
4. Generates synchronized WebVTT captions (`.vtt`).
5. Muxes video, speech audio, and captions into `<slug>-final.webm`.

---

### Phase 5 — Verification & Deliverable Package

Deliver the completed verification package:
1. **Final Narrated Video**: `packages/robos-test/run/demos/<slug>/<slug>-final.webm`
2. **Captions / Transcript**: `packages/robos-test/run/demos/<slug>/<slug>.vtt`
3. **DOM Assertions**: Verified text snapshots from the test run.

---

## Validation Checklist

- [ ] Narrated test script created with clear step-by-step user explanations.
- [ ] DOM selectors in `js:` actions verified against actual renderer HTML/JS.
- [ ] No hanging async calls (`minHold` kept between 2000–5000ms).
- [ ] Application code implemented and tested against the scenario.
- [ ] Video output (`<slug>-final.webm`) generated with synced audio and WebVTT captions.
- [ ] Walkthrough documentation updated with test results.
