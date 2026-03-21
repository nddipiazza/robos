'use strict';

/**
 * Event type → category mapping table.
 * Used by the event bus to auto-derive category from event type.
 */
const TYPE_TO_CATEGORY = {
  // PR review
  pr_review_requested: 'pr_review',
  pr_review_received: 'pr_review',
  pr_merged: 'pr_review',
  pr_opened: 'pr_review',

  // CI/CD
  ci_started: 'ci_cd',
  ci_completed: 'ci_cd',
  deploy: 'ci_cd',

  // Task management
  task_started: 'task',
  task_status_changed: 'task',

  // Agent
  agent_session: 'agent',

  // System
  disk_low: 'system',
  service_crash: 'system',
  update_available: 'system',
  scheduled_job_executed: 'system',

  // Git
  branch_created: 'git',
  commit: 'git',
  file_edited: 'git',

  // Journal
  manual_note: 'journal',
};

/**
 * Derive category from event type.
 * Returns 'unknown' if the type is not in the mapping table.
 */
function getCategory(eventType) {
  return TYPE_TO_CATEGORY[eventType] || 'unknown';
}

/**
 * Get all known event types.
 */
function getKnownTypes() {
  return Object.keys(TYPE_TO_CATEGORY);
}

/**
 * Get all categories.
 */
function getCategories() {
  return [...new Set(Object.values(TYPE_TO_CATEGORY))];
}

module.exports = { TYPE_TO_CATEGORY, getCategory, getKnownTypes, getCategories };
