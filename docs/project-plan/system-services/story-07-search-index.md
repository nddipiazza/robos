---
nav_exclude: true
---

# Story: Search Index — File System Indexer for @-Mentions

**Epic:** [System Services & Desktop Integration](epic.md)  
**Status:** Done  
**Points:** 5  

## Description

File system indexer that powers @-mention search in all AI text areas across RobOS apps. Indexes: file names, directory structure, git repos, and configuration paths. Fast fuzzy search via pre-built index. Updates incrementally on file change and index rebuilds. Results exposed via IPC for autocomplete dropdowns when users type `@` in any AI prompt input.

## Acceptance Criteria

- [x] Pre-built indexer scans source projects, configuration paths, and custom repositories
- [x] Supports incremental rebuilds and real-time progress streaming
- [x] Exposes IPC search endpoint `search-index` returning formatted matching paths
- [x] Follows RobOS dark theme and conventions
- [x] Runs reliably as a desktop application and background index service
- [x] Verified with automated E2E tests (`packages/robos-test/tests/search-index/e2e.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/search-index/`.
