# Story 32.08: Multi-Modal Narrated Video Walkthrough Generator

**Epic:** [Dual-State SDLC Knowledge Graph & E2E-Driven Verification Engine](epic.md)  
**Status:** Done  
**Points:** 8  

---

## 1. Overview & Problem Statement

Reading 500-line code diffs or deciphering dry unit test logs is exhausting for human reviewers. The highest-fidelity proof of work is watching the feature actually run in the UI, accompanied by a clear explanation of what was built, how edge cases are handled, and which architectural boundaries were respected.

Story 32.08 implements the **Multi-Modal Narrated Video Walkthrough Generator** (`packages/robos-reviewer/lib/video-generator.js`), automatically capturing screen recordings during headless E2E test runs, generating WebVTT subtitles, and generating structured JSON metadata chapter indexes.

### Core Capabilities
- **W3C WebVTT Subtitle Alignment**: Generates synchronized subtitle tracks with millisecond timecode precision.
- **Structured JSON Metadata Indexing**: Exports searchable chapter bookmarks, step durations, and execution metadata.
- **Headless Screen Capture (FFmpeg)**: Crystal-clear 1080p stream capture from Xvfb display `:99`.
- **Persistent Archiving**: Automatically saves `.webm`, `.vtt`, and `.json` artifacts into `~/.robos/development/walkthroughs/<slug>/`.

---

## 2. Acceptance Criteria

- [x] Generates crystal-clear 1080p video at 30/60 fps with zero visual tearing or dropped frames.
- [x] WebVTT subtitles display synchronized captions with 100% accuracy.
- [x] Full video generation completes in <30 seconds for a walkthrough.
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/sdlc-graph/video-generator.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/video-generator/`.
