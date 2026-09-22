---
nav_exclude: true
---

# Story 09-02: Voice Input Integration

**Epic:** [Voice & Input](epic.md)
**Status:** Completed
**Points:** 5

## Description

Voice Prompt Agent (`packages/voice-prompt`) provides a full desktop application and background REST API daemon on port 19188 (`ROBOS_VOICE_PORT`), as well as CLI tool `robos-voice`. Speech text streams in real-time via Server-Sent Events (`/api/stream`) and IPC (`vp-event-interim-text`). Supports prompt storage, manual editing, and clipboard copy.

## Acceptance Criteria

- [x] Works offline (no network required)
- [x] Real-time live streaming dictation in UI and over SSE
- [x] Tested in QEMU VM and automated test suite (`packages/robos-test/tests/voice-prompt/e2e.test.js`)

