# Story 08-01: EKGraph Schema Definition

**Epic:** [EKGraph](epic.md)
**Status:** Not started
**Points:** 8

## Description

Define the universal schema for describing a software engineering organization. Covers: repositories (URL, language, build system, CI), services (name, endpoints, logs, monitoring), environments (dev, staging, prod URLs), people (name, team, role), processes (deploy, oncall, incident), tooling (IDEs, CLIs, cloud consoles). Schema in JSON Schema or protobuf. Extensible — teams can add custom node types.

## Acceptance Criteria

- [ ] Schema covers the buildbarn-forms project's engineering context
- [ ] Data survives sync/restore cycle
- [ ] Other apps can query via robos-ekgraph API
