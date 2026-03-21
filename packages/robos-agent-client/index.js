/**
 * RobOS Agent Client — AI agent lifecycle management.
 *
 * Usage:
 *   const { createSession, listAgents } = require('robos-agent-client');
 *   const session = createSession('claude');
 *   session.start('/path/to/repo', ['src/index.js'], 'Fix the login bug');
 */
'use strict';

const { listAgents, detectInstalled, createSession, BACKENDS } = require('./agent-registry');
const { AgentSession, SESSION_DIR } = require('./agent-session');
const { ClaudeBackend } = require('./claude-backend');
const { CopilotBackend } = require('./copilot-backend');
const {
  questionnaire, draft, quiz, reviewFix,
  getReviewCycleCount, resetReviewCycles,
} = require('./workflow-stages');
const {
  QUESTIONNAIRE_PROMPT, DRAFT_PROMPT, QUIZ_PROMPT,
  REVIEW_FIX_PROMPT, PR_DESCRIPTION_PROMPT, interpolate,
} = require('./prompt-templates');

module.exports = {
  // Registry
  listAgents,
  detectInstalled,
  createSession,
  BACKENDS,

  // Session
  AgentSession,
  SESSION_DIR,

  // Backends
  ClaudeBackend,
  CopilotBackend,

  // Workflow stages
  questionnaire,
  draft,
  quiz,
  reviewFix,
  getReviewCycleCount,
  resetReviewCycles,

  // Prompt templates
  QUESTIONNAIRE_PROMPT,
  DRAFT_PROMPT,
  QUIZ_PROMPT,
  REVIEW_FIX_PROMPT,
  PR_DESCRIPTION_PROMPT,
  interpolate,
};
