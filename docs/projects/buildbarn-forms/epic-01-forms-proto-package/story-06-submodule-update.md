---
nav_exclude: true
---

# Story 01-06: Submodule Update Automation

**Epic:** [buildbarn-forms-proto Package](epic.md)
**Status:** Not started
**Points:** 3

## Description

Automate tracking of updates to the upstream `buildbarn/bb-storage` proto definitions. When `bb-storage` releases a new version, the proto submodule should be updated and a new version of `@hermetiq/buildbarn-forms-proto` should be published automatically (or at minimum, a PR should be opened).

This prevents the generated types from drifting out of sync with the actual Buildbarn server versions in production.

## Acceptance Criteria

- [ ] Scheduled GitHub Actions workflow (e.g., weekly) checks if the `bb-storage` submodule has a newer commit on its main branch
- [ ] If new commits are detected, a PR is opened against `buildbarn-forms-proto/main` with the submodule pointer updated
- [ ] The PR includes a summary of which proto files changed (using `git diff --name-only`)
- [ ] The PR title follows the pattern: `chore: update bb-storage protos to {short-sha}`
- [ ] The automated PR must pass CI (build + comment extraction) before it can be merged
- [ ] Alternatively: a manual `npm run update-protos` script that does the submodule update, regenerates, and commits

## Implementation Notes

Option A (automated PR):
```yaml
# .github/workflows/update-protos.yml
on:
  schedule:
    - cron: '0 9 * * 1'  # Monday 9am UTC
  workflow_dispatch:       # Manual trigger

jobs:
  update:
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - name: Update submodule
        run: |
          git submodule update --remote proto
          if git diff --quiet; then
            echo "No updates"
            exit 0
          fi
      - name: Open PR
        uses: peter-evans/create-pull-request@v6
        with:
          title: "chore: update bb-storage protos to ${{ github.sha }}"
          body: "Automated proto update from upstream bb-storage."
```

Option B (manual script):
```bash
#!/bin/bash
git submodule update --remote proto
npm run proto:generate
npm run build
git add proto dist
git commit -m "chore: update bb-storage protos"
```

## Notes

- Submodule pointer should track `buildbarn/bb-storage` `master` branch.
- Major breaking proto changes (field removals, type renames) will require manual review and a `buildbarn-forms` update as well.
