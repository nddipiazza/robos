# Story 12-07: Search Index

**Epic:** [System Services & Desktop Integration](epic.md)
**Status:** Not started
**Points:** 5

## Description

File system indexer that powers @-mention search in all AI text areas across RobOS apps. Indexes: file names, directory structure, git repos, .desktop apps. Fast fuzzy search via pre-built index. Updates incrementally on file change (inotify). Results shown as autocomplete dropdown when user types @ in any AI input.

## Acceptance Criteria

- [ ] Integrates with other RobOS apps via IPC or CLI
- [ ] Follows RobOS dark theme and conventions
- [ ] Runs reliably as a background service (if applicable)
