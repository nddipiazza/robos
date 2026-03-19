# Story 17-07: Manual Notes and Voice Dictation Entries

**Epic:** [RobOS Work Journal](epic.md)
**Status:** Not started
**Points:** 3

## Description

Developer can add manual notes to the journal at any time. Useful for: meeting notes, design decisions, context that doesn't come from automated sources.

### Entry methods
- **Journal Viewer app**: Text area at the bottom, type and submit
- **Voice dictation**: Click mic button, speak, text transcribed and added
- **robos-journal-append CLI**: `robos-journal-append "Discussed API design with Bob"`
- **Keyboard shortcut**: Global hotkey (e.g., Super+J) opens a quick-note popup

### Note format
Notes are timestamped and appended to the day's "Manual Notes" section:
```
## Manual Notes
- 14:30 Discussed API design with Bob, decided to use proto reflection
- 16:00 Need to check if bb-storage supports CAS batch reads
```

## Acceptance Criteria

- [ ] Notes added from app, CLI, voice, and keyboard shortcut
- [ ] Timestamped automatically
- [ ] Appear in correct day's journal entry
- [ ] Voice dictation works offline
