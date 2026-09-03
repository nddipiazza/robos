# E2E-Driven Development (EDD)

Perform task and feature development driven by narrated End-to-End tests that record synchronized walkthrough videos with voice-over narration and captions.

## Input

$ARGUMENTS — `<app-id> "<task description or requirements>"`

## Procedure

Follow the 5-phase EDD cycle in `plugins/robos/skills/e2e-driven-dev/SKILL.md`:
1. **Spec & Script Design**: Design the user story and narrated scenario script.
2. **Create Narrated E2E Test**: Write test in `packages/robos-test/demos/<app-id>-<slug>-demo.js`.
3. **Implement Feature**: Code backend IPC, preload bindings, and renderer UI.
4. **Run Narrated E2E**: Execute `./scripts/e2e-container.sh node packages/robos-test/demos/<app-id>-<slug>-demo.js` to generate video, speech audio, and captions.
5. **Review Deliverable**: Present the final video and captions to the user.
