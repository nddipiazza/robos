---
nav_exclude: true
---

# Story 09-01: Local STT Engine

**Epic:** [Voice & Input](epic.md)
**Status:** Completed
**Points:** 8

## Description

Install and run a local, offline speech-to-text engine using OpenAI Whisper (`@xenova/transformers` ONNX models `whisper-tiny.en` and `whisper-base.en`). No network dependency — 100% on-device CPU execution. Audio recording supports PipeWire (`pw-record`), ALSA (`arecord`), and SoX with 16kHz mono sampling. Supports live interim streaming transcription every ~2 seconds.

## Acceptance Criteria

- [x] Works offline (no network required, local ONNX runtime)
- [x] Streaming interim transcription and low latency for speech recognition
- [x] Tested in QEMU VM and headless Xvfb virtual audio (`packages/robos-test/tests/voice-prompt/unit.test.js`)

