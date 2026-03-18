# Story 11-05: Release CI/CD Pipeline

**Epic:** [Release & Packaging](epic.md)
**Status:** Not started
**Points:** 5

## Description

GitHub Actions workflow: build VM image, run smoke tests (boot, verify apps launch, run DOM snapshot tests on each app), publish artifacts (QCOW2, OVA, checksums). Triggered on: release tag push, manual dispatch. Matrix: test with different RAM/CPU configs. Publish to GitHub Releases.

## Acceptance Criteria

- [ ] Automated and repeatable (no manual steps)
- [ ] Documented in CLAUDE.md
- [ ] Tested in CI
