# Story 09-01: Local STT Engine

**Epic:** [Voice & Input](epic.md)
**Status:** Not started
**Points:** 8

## Description

Install and run a local, offline speech-to-text engine. Primary: OpenAI Whisper (whisper.cpp for performance). Fallback: Vosk. No network dependency — all processing on-device. Runs as a system service that streams transcribed text via a local socket. Configurable: model size (tiny/base/small/medium), language.

## Acceptance Criteria

- [ ] Works offline (no network required)
- [ ] Latency under 500ms for word recognition
- [ ] Tested in QEMU VM with virtual audio
