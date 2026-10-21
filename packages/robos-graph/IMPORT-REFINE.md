# Import & Refine

Describe the correction in plain language and optionally narrow it by title or
node ID. **Prepare agent brief** shows the request, matching records and related
records as readable cards. Expand **Source evidence** for repository, file, line
and revision. Missing evidence and truncated matches are explicit.

**Ask AI agent** proposes edits through your active agent CLI; it never saves automatically. For an
external coding agent, use **Advanced: import a file or paste agent edits**.
Agent protocol instructions, validation rules and raw JSON remain expandable
technical details rather than the primary reading experience.

**Preview changes** shows additions/removals and labeled before/after values,
source evidence, validation errors, warnings, conflicts and open questions.
Structural validation does not prove source accuracy. Review the evidence before
**Save reviewed revision**. Conflicts or validation failures block saving;
discarding leaves accepted graph data unchanged. This presentation change adds
no graph entities and changes no graph storage or agent protocol.

The real Electron tests in `workspace-readable.e2e.js` and
`workspace-review.e2e.js` exercise brief presentation, imports, preview, save,
discard, conflict gating and persistence using isolated GraphWorkspace data.
