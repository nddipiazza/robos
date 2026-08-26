# Create Feature Specification from Idea

Convert a raw idea note or prompt into a structured feature specification stored in `docs/ideas/specs/`.

## Input

$ARGUMENTS — Raw text of the idea, or path to a file in `docs/ideas/inbox/`

## Instructions

1. **Parse Idea**: Read the raw input text or inbox file.
2. **Derive Spec Name**: Create a clear, slugified filename (e.g. `docs/ideas/specs/voice-command-bar.md`).
3. **Generate Feature Spec**: Fill out the `docs/ideas/TEMPLATE.md` structure:
   - Overview & Vision
   - User Stories & Use Cases
   - Key Capabilities & Scope (In Scope vs Out of Scope)
   - Architectural & System Integration (Impacted packages/apps, IPC endpoints, UI/UX, config)
   - Proposed Implementation Plan (Phased tasks)
   - Acceptance Criteria
4. **Save File**: Write the completed `.md` spec to `docs/ideas/specs/<spec-slug>.md`.
5. **Update Index**: If applicable, reference the new spec in `docs/ideas/README.md`.
