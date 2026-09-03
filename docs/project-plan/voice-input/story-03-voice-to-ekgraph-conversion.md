---
nav_exclude: true
---

# Story 09-03: Voice-to-EKGraph Conversion

**Epic:** [Voice & Input](epic.md)
**Status:** Not started
**Points:** 5

## Description

When a developer speaks to AI (questionnaire, context notes, journal), the conversation is analyzed and structured data is extracted. AI creates/updates EKGraph nodes from the conversation. Example: 'The staging environment for bb-storage is at staging.buildbarn.example.com' → creates an Environment node in EKGraph.

## Acceptance Criteria

- [ ] Works offline (no network required)
- [ ] Latency under 500ms for word recognition
- [ ] Tested in QEMU VM with virtual audio
