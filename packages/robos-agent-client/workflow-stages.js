/**
 * Workflow Stages — task-driven AI workflow automation.
 *
 * Each stage function generates prompts from templates, feeds them to an
 * agent session, and returns structured results.  Stages:
 *
 *   1. questionnaire — agent asks clarifying questions
 *   2. draft         — agent implements the solution
 *   3. quiz          — verification questions about the changes
 *   4. reviewFix     — agent addresses review comments
 */
'use strict';

const {
  QUESTIONNAIRE_PROMPT,
  DRAFT_PROMPT,
  QUIZ_PROMPT,
  REVIEW_FIX_PROMPT,
  interpolate,
} = require('./prompt-templates');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build the common template vars from a task context object. */
function _taskVars(taskContext) {
  return {
    taskTitle: taskContext.title || '',
    taskDescription: taskContext.description || '',
    repoUrl: taskContext.repoUrl || '',
    branch: taskContext.branch || '',
    contextFiles: Array.isArray(taskContext.contextFiles)
      ? taskContext.contextFiles.map((f) => `- ${f}`).join('\n')
      : '',
  };
}

/**
 * Collect agent output by running a prompt through the session.
 * Returns the raw accumulated output string.
 */
async function _runPrompt(session, workspaceDir, contextFiles, prompt) {
  return new Promise((resolve, reject) => {
    let output = '';
    session.onOutput((chunk) => { output += chunk; });
    session.onComplete(() => resolve(output));
    session.on('error', (err) => reject(err));

    try {
      session.start(workspaceDir, contextFiles, prompt);
    } catch (err) {
      reject(err);
    }
  });
}

// ── Stage 1: Questionnaire ──────────────────────────────────────────────────

/**
 * Ask the agent to analyze the task and produce clarifying questions.
 *
 * @param {AgentSession} session
 * @param {object} taskContext — { title, description, repoUrl, branch, contextFiles, workspaceDir }
 * @returns {Promise<{questions: string[], rawOutput: string}>}
 */
async function questionnaire(session, taskContext) {
  const prompt = interpolate(QUESTIONNAIRE_PROMPT, _taskVars(taskContext));
  const output = await _runPrompt(
    session,
    taskContext.workspaceDir || process.cwd(),
    taskContext.contextFiles || [],
    prompt,
  );

  // Parse numbered list from output
  const questions = _parseNumberedList(output);
  return { questions, rawOutput: output };
}

// ── Stage 2: Draft ──────────────────────────────────────────────────────────

/**
 * Ask the agent to implement the solution using task context + Q&A answers.
 *
 * @param {AgentSession} session
 * @param {object} taskContext
 * @param {string} answers — formatted Q&A string
 * @returns {Promise<{summary: string, rawOutput: string}>}
 */
async function draft(session, taskContext, answers) {
  const vars = { ..._taskVars(taskContext), answers: answers || 'No additional context.' };
  const prompt = interpolate(DRAFT_PROMPT, vars);
  const output = await _runPrompt(
    session,
    taskContext.workspaceDir || process.cwd(),
    taskContext.contextFiles || [],
    prompt,
  );
  return { summary: output, rawOutput: output };
}

// ── Stage 3: Quiz ───────────────────────────────────────────────────────────

/**
 * Generate verification quiz questions about the changes.
 *
 * @param {AgentSession} session
 * @param {object} taskContext
 * @param {string} changes — summary of changes made
 * @param {number} [questionCount=5]
 * @returns {Promise<{questions: string[], rawOutput: string}>}
 */
async function quiz(session, taskContext, changes, questionCount = 5) {
  const vars = {
    ..._taskVars(taskContext),
    changes: changes || '',
    questionCount: String(questionCount),
  };
  const prompt = interpolate(QUIZ_PROMPT, vars);
  const output = await _runPrompt(
    session,
    taskContext.workspaceDir || process.cwd(),
    taskContext.contextFiles || [],
    prompt,
  );

  const questions = _parseNumberedList(output);
  return { questions, rawOutput: output };
}

// ── Stage 4: Review Fix ─────────────────────────────────────────────────────

/** Internal counter for review cycles keyed by session ID. */
const _reviewCycles = new Map();

/**
 * Feed review comments to the agent and ask it to fix issues.
 *
 * @param {AgentSession} session
 * @param {object} taskContext
 * @param {string} reviewComments
 * @returns {Promise<{summary: string, cycleNumber: number, rawOutput: string}>}
 */
async function reviewFix(session, taskContext, reviewComments) {
  const prev = _reviewCycles.get(session.id) || 0;
  const cycleNumber = prev + 1;
  _reviewCycles.set(session.id, cycleNumber);

  const vars = {
    ..._taskVars(taskContext),
    reviewComments: reviewComments || '',
    cycleNumber: String(cycleNumber),
  };
  const prompt = interpolate(REVIEW_FIX_PROMPT, vars);
  const output = await _runPrompt(
    session,
    taskContext.workspaceDir || process.cwd(),
    taskContext.contextFiles || [],
    prompt,
  );

  return { summary: output, cycleNumber, rawOutput: output };
}

/**
 * Get the current review cycle count for a session.
 * @param {string} sessionId
 * @returns {number}
 */
function getReviewCycleCount(sessionId) {
  return _reviewCycles.get(sessionId) || 0;
}

/**
 * Reset the review cycle counter for a session.
 * @param {string} sessionId
 */
function resetReviewCycles(sessionId) {
  _reviewCycles.delete(sessionId);
}

// ── Utilities ────────────────────────────────────────────────────────────────

/** Extract numbered items (e.g. "1. Foo" / "1) Foo") from text. */
function _parseNumberedList(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const items = [];
  for (const line of lines) {
    const m = line.match(/^\s*\d+[.)]\s+(.+)/);
    if (m) items.push(m[1].trim());
  }
  return items;
}

module.exports = {
  questionnaire,
  draft,
  quiz,
  reviewFix,
  getReviewCycleCount,
  resetReviewCycles,
  _parseNumberedList,
  _taskVars,
  _reviewCycles,
};
