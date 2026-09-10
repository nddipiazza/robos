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

const {
  HarnessRouterClient,
  EmbeddedHarnessRouter,
  getHarnessRouter,
  UHP_SPEC_VERSION,
  DEFAULT_UHP_URL,
} = require('./harness-router');
const { HarnessRouterBackend } = require('./harness-backend');

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
  HarnessRouterBackend,

  // HarnessRouter / UHP Engine
  HarnessRouterClient,
  EmbeddedHarnessRouter,
  getHarnessRouter,
  UHP_SPEC_VERSION,
  DEFAULT_UHP_URL,

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
