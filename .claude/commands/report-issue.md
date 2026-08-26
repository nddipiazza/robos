# Report Issue / Create Issue Specification

Convert a raw issue report, bug description, or prompt into structured issue specifications stored in `docs/issues/reported/`.

## Input

$ARGUMENTS — Raw text description of the issue(s), or path to a raw note file in `docs/issues/inbox/`

## Instructions

1. **Parse Issue Input**: Read the raw input text or inbox file. If multiple issues are provided in a bulleted list, separate them into individual issue specifications.
2. **Assign Issue IDs**: Assign sequential IDs (e.g., `ISSUE-001`, `ISSUE-002`) and slugified filenames (e.g. `docs/issues/reported/ISSUE-001-ubuntu-26-firstboot-popups.md`).
3. **Save Raw Dump**: Save the raw text prompt/input into `docs/issues/inbox/` if not already present.
4. **Generate Issue Specs**: Fill out the `docs/issues/TEMPLATE.md` structure for each issue:
   - Executive Summary & Metadata (ID, Status, Severity, Target Components)
   - Problem Description & Expected vs Observed Behavior
   - Steps to Reproduce
   - Technical Analysis & Suspected Root Cause
   - Proposed Fix Strategy
   - Acceptance Criteria & Verification
5. **Save Files**: Write the completed `.md` issue specs to `docs/issues/reported/<issue-id>-<slug>.md`.
6. **Update Index**: Register the new issues in `docs/issues/README.md` issue registry table.
