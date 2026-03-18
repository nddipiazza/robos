# Story 10-03: AI-Generated Reports

**Epic:** [Management & Reporting](epic.md)
**Status:** Not started
**Points:** 5

## Description

Managers type natural language queries: 'How many PRs did each developer merge this sprint?', 'Compare deploy frequency this month vs last', 'Show me tasks stuck in review for more than 2 days'. AI queries task server + CI data + EKGraph and generates the report. Reports can be saved, scheduled, and shared via distributed config.

## Acceptance Criteria

- [ ] Data sourced from task server and CI systems (not hardcoded)
- [ ] Updates in real-time or near-real-time
- [ ] Dark theme consistent with RobOS design system
