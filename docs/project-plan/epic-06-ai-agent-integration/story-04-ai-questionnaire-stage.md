# Story 06-04: AI Questionnaire Stage

**Epic:** [AI Agent Integration](epic.md)
**Status:** Not started
**Points:** 5

## Description

Before coding, the AI agent analyzes the task and asks clarifying questions to prevent hallucinations. Questions are displayed in the agent session UI. Developer answers via text or voice dictation. Answers become part of the task context. Agent only proceeds to AI Draft when all questions are answered or developer says 'proceed anyway'.

## Acceptance Criteria

- [ ] Tested end-to-end with buildbarn-forms example task
- [ ] Agent actions visible in real-time in the UI
- [ ] Task workflow stage advances correctly
