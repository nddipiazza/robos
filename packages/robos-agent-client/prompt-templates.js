/**
 * Prompt templates for AI agent workflow stages.
 *
 * Templates use {{variable}} interpolation.  Call interpolate(template, vars)
 * to produce the final prompt string.
 */
'use strict';

// ── Templates ────────────────────────────────────────────────────────────────

const QUESTIONNAIRE_PROMPT = `You are an AI development assistant working on a software task.

## Task
**Title:** {{taskTitle}}
**Description:** {{taskDescription}}
**Repository:** {{repoUrl}}
**Branch:** {{branch}}

## Context Files
{{contextFiles}}

## Instructions
Analyze this task carefully. Before implementing anything, ask 3-5 clarifying questions that will help you produce a better solution. Focus on:
- Ambiguities in the requirements
- Architectural decisions that need confirmation
- Edge cases that should be handled
- Testing expectations

Return your questions as a numbered list.`;

const DRAFT_PROMPT = `You are an AI development assistant implementing a software task.

## Task
**Title:** {{taskTitle}}
**Description:** {{taskDescription}}
**Repository:** {{repoUrl}}
**Branch:** {{branch}}

## Context Files
{{contextFiles}}

## Clarification Answers
{{answers}}

## Instructions
Implement the solution for this task. Follow the project conventions and coding standards. When done, provide a summary of all changes made, including:
- Files created or modified
- Key design decisions
- Any assumptions made`;

const QUIZ_PROMPT = `You are a code reviewer generating verification questions about recent changes.

## Task
**Title:** {{taskTitle}}
**Description:** {{taskDescription}}

## Changes Made
{{changes}}

## Instructions
Generate {{questionCount}} quiz questions for the developer to verify they understand the changes. Questions should cover:
- Why specific design decisions were made
- How edge cases are handled
- What the impact of the changes is
- How to test the changes

Return questions as a numbered list.`;

const REVIEW_FIX_PROMPT = `You are an AI development assistant addressing code review feedback.

## Task
**Title:** {{taskTitle}}
**Description:** {{taskDescription}}

## Review Comments
{{reviewComments}}

## Review Cycle
This is review cycle #{{cycleNumber}}.

## Instructions
Address each review comment. For each comment:
1. Explain what you changed and why
2. If you disagree with a comment, explain your reasoning

Provide a summary of all fixes made.`;

const PR_DESCRIPTION_PROMPT = `You are an AI assistant writing a pull request description.

## Task
**Title:** {{taskTitle}}
**Description:** {{taskDescription}}

## Changes Made
{{changes}}

## Instructions
Write a concise pull request description in this format:

## Summary
(1-3 bullet points describing the changes)

## Changes
(Detailed list of files changed and why)

## Testing
(How to test these changes)

## Notes
(Any caveats, follow-ups, or discussion points)`;

// ── Interpolation ────────────────────────────────────────────────────────────

/**
 * Replace all {{variable}} placeholders in a template string.
 * Missing keys are left as empty strings.
 */
function interpolate(template, vars) {
  if (typeof template !== 'string') throw new Error('template must be a string');
  if (!vars || typeof vars !== 'object') return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    return vars[key] !== undefined ? String(vars[key]) : '';
  });
}

module.exports = {
  QUESTIONNAIRE_PROMPT,
  DRAFT_PROMPT,
  QUIZ_PROMPT,
  REVIEW_FIX_PROMPT,
  PR_DESCRIPTION_PROMPT,
  interpolate,
};
