# Epic 23: Release Pipeline & Versioning

**Status:** Not started
**Priority:** Critical
**Dependencies:** Epic 01 (Desktop Foundation — build.sh)

Semantic versioning, reproducible release builds, and a GitHub Actions pipeline that produces downloadable releases on every tag push. Starting at v0.0.1.

## Why This Is Critical

Without versioning and a release pipeline, there's no way to distribute RobOS, track what changed between builds, or roll back to a known-good state. Every serious open-source project needs tagged releases with checksums.

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [Version tracking and bump script](story-01-versioning.md) | Not started | 3 |
| 02 | [README.md for the repository](story-02-readme.md) | Not started | 3 |
| 03 | [Release build script (local)](story-03-release-build.md) | Not started | 5 |
| 04 | [GitHub Actions release workflow](story-04-github-actions.md) | Not started | 5 |
| 05 | [Tag v0.0.1 and first release](story-05-first-release.md) | Not started | 2 |
