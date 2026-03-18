# Story 08-06: EKGraph Query API

**Epic:** [EKGraph](epic.md)
**Status:** Not started
**Points:** 3

## Description

robos-ekgraph shared library exports: search(query), getNode(path), getLinked(nodeId, type), suggest(context). All RobOS apps can query the EKGraph for context. AI agents use it to find: repo URLs, deployment instructions, logging endpoints, team contacts. MCP server wrapper for Claude Code integration.

## Acceptance Criteria

- [ ] Schema covers the buildbarn-forms project's engineering context
- [ ] Data survives sync/restore cycle
- [ ] Other apps can query via robos-ekgraph API
