---
nav_exclude: true
---

# Story 04-05: Configurable Task Workflow Engine

**Epic:** [Task Management](epic.md)
**Status:** Not started
**Points:** 8

## Description

Build the workflow engine that drives work items through stages. Default story workflow: setup → ai_questionnaire → ai_draft → human_review → ai_quiz → pr_created → ci → review_fix → approved → merged → deployed. Each stage has configurable gates (conditions that must pass to advance). Workflows defined in YAML, stored in RobOS distributed config, editable in Workflow Studio.

## Acceptance Criteria

- [ ] Workflow YAML schema defined and validated
- [ ] Default workflows for Release, Epic, Story, Bug
- [ ] Gates evaluated automatically (e.g., "all tests pass" for CI stage)
- [ ] Manual override: users can skip/force-advance stages
- [ ] Workflow changes apply to new tasks (existing tasks keep their workflow version)
- [ ] Workflow Studio visual editor (separate story but engine must support it)
