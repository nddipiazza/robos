---
nav_exclude: true
---

# Story 09-03: Voice-to-EKGraph Conversion

**Epic:** [Voice & Input](epic.md)
**Status:** Completed
**Points:** 5

## Description

Voice Prompt Agent enriches all voice dictation with active desktop context via `context-provider.js` (detecting focused window title, PID, app class, Git repository, branch, dirty working tree status, and working directory). Transcribed prompts with context metadata are registered and accessible via Knowledge Graph entity `urn:robos:app:voice-prompt` conforming to W3C SHACL shape `urn:robos:shape:DesktopAppShape`.

## Acceptance Criteria

- [x] Works offline (no network required)
- [x] Automatically captures and associates active desktop window and Git context
- [x] Conforms to SDLC Knowledge Graph W3C SHACL validation

