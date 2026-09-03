---
name: e2e-driven-dev
description: Execute task development using an End-to-End Driven Development (EDD) workflow on localhost (Docker/Xvfb) where text-narrated E2E tests, structured step proofs, on-screen text narration, and video walkthroughs validate feature implementation.
---

# E2E-Driven Development (EDD) Skill

Perform feature development or bug fixing on a generic task using an **End-to-End Driven Development (EDD)** methodology. In this workflow, development begins by creating a text-narrated E2E test scenario that records video with clear on-screen text narration cards and WebVTT step descriptions. The test serves as both the executable specification and the user-facing verification artifact.

> [!IMPORTANT]
> - **Zero VM Requirement**: E2E testing and demonstration recording run entirely on **localhost** using isolated Docker containers (`./scripts/e2e-container.sh`) or local virtual framebuffers (`Xvfb`) and headless test runs. Never rely on slow QEMU virtual machines or SSH deployment for E2E-driven development feedback loops.
> - **Text-Only Step Narration**: Verification videos use on-screen text narration cards, element callout badges, and WebVTT captions explaining each step. No audio voice narration is needed. Pacing is fast, responsive, and continuous.

---

## When to Use

Use this skill when:
- The user requests building a new feature, flow, or bug fix using E2E-driven development (`/e2e-driven-dev` or `/do-e2e-driven-dev`).
- You need to deliver visual proof of feature completion accompanied by step-by-step text narration, synced captions, and scenario step logs.
- Implementing UI/UX workflows across any RobOS app (`dev-central`, `git-projects`, `task-board`, `robos-desktop`, etc.).

---

## Input

`$ARGUMENTS` — `<app-id> "<task description or acceptance criteria>"`

Examples:
- `robos-desktop "Pin and unpin applications from taskbar and resize dock"`
- `dev-central "Add sprint filter dropdown and show active sprint summary"`
- `git-projects "Add git worktree creation modal with branch selection"`
- `task-board "Add swimlane grouping by priority with drag-and-drop"`

---

## Workflow: The 5-Phase EDD Cycle

```
┌────────────────────────────────────────────────────────┐
│ 1. Spec & Script Design                                │
│    Define user story & text-narrated test script (cues)│
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
│ 4. Run Isolated Narrated E2E & Produce Video Artifact  │
│    Execute demo-runner in Docker / local Xvfb          │
│    Record WebM + on-screen text narration + WebVTT     │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ 5. Structured Verification Report                      │
│    Present final video, VTT transcript, and step logs  │
└────────────────────────────────────────────────────────┘
```

---

## Detailed Procedures

### Phase 1 — Spec & Script Design

1. **Analyze Requirements**: Extract the user journey, UI controls, backend/IPC operations, and acceptance criteria.
2. **Design Test Script Cues with Targeted Text Narration Callouts**:
   Every web element interaction (button press, text input, textarea edit, dropdown select, hover) **MUST** include targeted visual callouts explaining what the test is doing:
   - `target`: CSS selector for the targeted web element (e.g. `'#sprint-filter'`, `'button.btn-primary'`, `'textarea#issue-desc'`).
   - `action`: Interaction type (`'click'`, `'type'`, `'hover'`, `'select'`).
   - `value`: (Optional) String to type into input/textarea or option value to select.
   - `callout`: (Optional) Concise explanation displayed in the floating callout directly adjacent to the element.
   - `narration`: Text explanation describing the purpose and outcome of the step.
   - `minHold`: Display duration (1500–3500ms) providing ample time to observe the on-screen action and text callout.

> [!IMPORTANT]
> **No Hidden Functionality**: Smart callouts are automatically positioned above, below, or to the side of the target element's bounding rect with `pointer-events: none` and translucent styling, ensuring the callout never covers or hides the interactive element or underlying functionality.

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
    minHold: 2500,
  },
  {
    narration: 'The user opens the sprint filter dropdown to select the active sprint.',
    target: '#sprint-filter',
    action: 'click',
    callout: 'Open Sprint Filter Dropdown',
    minHold: 2500,
  },
  {
    narration: 'Selecting Sprint 24 filters the task cards and updates the sprint metrics banner.',
    target: '[data-sprint-id="sprint-24"]',
    action: 'click',
    callout: 'Select Sprint 24',
    minHold: 3000,
  },
  {
    narration: 'The developer enters a quick search term to find high-priority defect tickets.',
    target: 'input#filter-search',
    action: 'type',
    value: 'P0 blocker',
    callout: 'Filter tickets by "P0 blocker"',
    minHold: 3000,
  },
  {
    narration: 'The active sprint cards are rendered with updated story point totals.',
    js: `(() => {
      const count = document.querySelectorAll('.task-card').length;
      console.log('Filtered task count:', count);
    })()`,
    minHold: 3000,
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

### Phase 4 — Execute Narrated E2E on Localhost (Isolated)

Run the text-narrated E2E test using the containerized test harness or local virtual display:

#### In Docker E2E Container (Recommended):
```bash
./scripts/e2e-container.sh node packages/robos-test/demos/<app-id>-<feature-slug>-demo.js
```

#### On Local Host (with Xvfb / Headless Display):
```bash
xvfb-run -a -s "-screen 0 1920x1080x24" node packages/robos-test/demos/<app-id>-<feature-slug>-demo.js
```

This pipeline automatically:
1. Launches the Electron app inside the virtual display (isolated, no host popups).
2. Displays step text narration banners and pointer callouts on active elements.
3. Records video with `ffmpeg` while executing each scripted action.
4. Generates synchronized WebVTT captions (`.vtt`) for the step transcript.
5. Saves the final verified video into `<slug>-final.webm`.

---

### Phase 5 — Structured Verification Report

Reports delivered to the user must provide **actionable evidence showing the feature works**, rather than generic test counts:

1. **Embedded Video Artifact**: Embed the generated `<slug>-final.webm` video demonstration.
2. **Scenario Step Definitions Table**: Present a chronological step table mapping:
   - Timeline timestamps (`00:00:00 - 00:00:15`)
   - Step title / action
   - Text explanation of what the step executed and verified
3. **Synchronized Transcript**: Full WebVTT captions transcript.
4. **File Deliverables & Local Walkthrough Archive**:
   - Local Test Run: `packages/robos-test/run/demos/<slug>/<slug>-final.webm` & `<slug>.vtt`
   - Persistent Archive: `~/.robos/development/walkthroughs/<slug>/`
     - `<slug>-final.webm` (video)
     - `<slug>.vtt` (captions)
     - `walkthrough.md` (summary, metadata, and step transcript table)
     - Historical timestamped runs: `~/.robos/development/walkthroughs/<slug>/history/<timestamp>/`

---

## Validation Checklist

- [ ] Text-narrated test script created with clear step-by-step user explanations.
- [ ] DOM selectors in `js:` actions verified against actual renderer HTML/JS.
- [ ] Executed on localhost (Docker/Xvfb container) without QEMU VM overhead and without host desktop popups.
- [ ] Video output (`<slug>-final.webm`) generated with on-screen text banners and WebVTT captions.
- [ ] Walkthrough deliverables verified in persistent archive `~/.robos/development/walkthroughs/<slug>/`.
- [ ] Verification report documents step definitions and proof table in order.
