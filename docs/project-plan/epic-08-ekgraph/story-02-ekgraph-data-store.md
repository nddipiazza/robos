# Story 08-02: EKGraph Data Store

**Epic:** [EKGraph](epic.md)
**Status:** Not started
**Points:** 5

## Description

Store EKGraph data in the RobOS distributed config store (git-backed). Each node is a YAML/JSON file in a directory hierarchy. Supports: create, read, update, delete, list, search. Version history via git. robos-ekgraph shared library provides the API. Conflict resolution on sync.

## Acceptance Criteria

- [ ] Schema covers the buildbarn-forms project's engineering context
- [ ] Data survives sync/restore cycle
- [ ] Other apps can query via robos-ekgraph API
