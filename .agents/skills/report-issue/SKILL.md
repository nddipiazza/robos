# Report Issue Skill

This skill converts raw user bug reports, error logs, or issue descriptions into standardized, actionable issue specifications in `docs/issues/reported/`.

## When to Use

Use this skill when:
- The user provides bullet points or unstructured text describing bugs/defects in RobOS.
- The user runs `/report-issue` or asks to dump/report an issue.

## Procedure

1. **Dump Raw Report**: Ensure the raw prompt or issue text is preserved in `docs/issues/inbox/<topic-slug>.txt`.
2. **Structure Specification**: For each reported defect, fill out `docs/issues/TEMPLATE.md` and save to `docs/issues/reported/ISSUE-<XXX>-<slug>.md`.
3. **Register Entry**: Add an entry to the table in `docs/issues/README.md`.
