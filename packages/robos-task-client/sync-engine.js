/**
 * RobOS Sync Engine — bidirectional status/hours/comment sync between
 * RobOS workflow stages and external task servers.
 *
 * Usage:
 *   const { SyncEngine } = require('./sync-engine');
 *   const engine = new SyncEngine(adapter, statusMap, opts);
 *   await engine.transitionAndSync('BBF-42', 'in_review');
 *   engine.startPolling();  // bidirectional sync every 60s
 *   engine.stopPolling();
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Status mapping ───────────────────────────────────────────────────────────

/**
 * Maps between RobOS workflow stages and task server statuses.
 *
 * Config format (in settings.json per task server):
 *   status_map: [
 *     { robos: 'backlog',     external: 'To Do' },
 *     { robos: 'in_progress', external: 'In Progress' },
 *     { robos: 'in_review',   external: 'In Review' },
 *     { robos: 'deploying',   external: 'Deploying' },
 *     { robos: 'deployed',    external: 'Done' },
 *   ]
 */

function robosToExternal(statusMap, robosStage) {
  if (!statusMap || !statusMap.length) return robosStage;
  const entry = statusMap.find(m => m.robos === robosStage);
  return entry ? entry.external : robosStage;
}

function externalToRobos(statusMap, externalStatus) {
  if (!statusMap || !statusMap.length) return externalStatus;
  const entry = statusMap.find(m =>
    m.external.toLowerCase() === externalStatus.toLowerCase()
  );
  return entry ? entry.robos : externalStatus;
}

// ── Time tracking ────────────────────────────────────────────────────────────

const TRACKING_DIR = path.join(os.homedir(), '.config', 'robos', 'time-tracking');

function getTrackingFile(issueKey) {
  return path.join(TRACKING_DIR, `${issueKey.replace(/[^a-zA-Z0-9-_#]/g, '_')}.json`);
}

function readTracking(issueKey) {
  try {
    return JSON.parse(fs.readFileSync(getTrackingFile(issueKey), 'utf8'));
  } catch {
    return { issueKey, entries: [], currentStage: null, stageStartedAt: null };
  }
}

function writeTracking(issueKey, data) {
  fs.mkdirSync(TRACKING_DIR, { recursive: true });
  fs.writeFileSync(getTrackingFile(issueKey), JSON.stringify(data, null, 2));
}

/**
 * Record a stage transition. Returns time spent in previous stage (seconds).
 */
function recordTransition(issueKey, fromStage, toStage) {
  const tracking = readTracking(issueKey);
  const now = new Date().toISOString();
  let timeSpent = 0;

  if (tracking.currentStage && tracking.stageStartedAt) {
    timeSpent = Math.round((Date.now() - new Date(tracking.stageStartedAt).getTime()) / 1000);
    tracking.entries.push({
      stage: tracking.currentStage,
      startedAt: tracking.stageStartedAt,
      endedAt: now,
      timeSpentSeconds: timeSpent,
    });
  }

  tracking.currentStage = toStage;
  tracking.stageStartedAt = now;
  writeTracking(issueKey, tracking);

  return timeSpent;
}

/**
 * Get total time spent across all stages for an issue.
 */
function getTotalTimeSpent(issueKey) {
  const tracking = readTracking(issueKey);
  let total = tracking.entries.reduce((sum, e) => sum + (e.timeSpentSeconds || 0), 0);
  // Add current stage time
  if (tracking.stageStartedAt) {
    total += Math.round((Date.now() - new Date(tracking.stageStartedAt).getTime()) / 1000);
  }
  return total;
}

// ── Comment templates ────────────────────────────────────────────────────────

const COMMENT_TEMPLATES = {
  stage_change: '[RobOS] Status changed: {{from}} → {{to}}',
  pr_created: '[RobOS] PR {{prUrl}} created',
  ci_passed: '[RobOS] CI passed ✓',
  ci_failed: '[RobOS] CI failed ✗ — {{details}}',
  deployed: '[RobOS] Deployed to {{env}} ({{version}})',
  time_logged: '[RobOS] ⏱ {{hours}}h logged in {{stage}}',
};

function formatComment(template, vars) {
  let result = COMMENT_TEMPLATES[template] || template;
  for (const [key, value] of Object.entries(vars || {})) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
  }
  return result;
}

// ── Sync Engine ──────────────────────────────────────────────────────────────

class SyncEngine {
  /**
   * @param {object} adapter — JiraAdapter or GitHubAdapter instance
   * @param {Array} statusMap — status mapping array
   * @param {object} opts — { pollIntervalMs, autoLogHours, onConflict, onSync }
   */
  constructor(adapter, statusMap = [], opts = {}) {
    this.adapter = adapter;
    this.statusMap = statusMap;
    this.pollIntervalMs = opts.pollIntervalMs || 60000;
    this.autoLogHours = opts.autoLogHours !== false;
    this.onConflict = opts.onConflict || (() => {});
    this.onSync = opts.onSync || (() => {});
    this._pollTimer = null;
    this._knownStates = new Map(); // issueKey → last known external status
  }

  /**
   * Transition an issue to a new RobOS stage and sync to the task server.
   */
  async transitionAndSync(issueKey, toRobosStage, opts = {}) {
    const tracking = readTracking(issueKey);
    const fromStage = tracking.currentStage;

    // Record time
    const timeSpent = recordTransition(issueKey, fromStage, toRobosStage);

    // Map to external status and transition
    const externalStatus = robosToExternal(this.statusMap, toRobosStage);
    try {
      if (this.adapter.type === 'github') {
        await this.adapter.transitionIssueTo(issueKey.replace('#', ''), externalStatus, fromStage);
      } else {
        await this.adapter.transitionIssueTo(issueKey, externalStatus);
      }
    } catch (e) {
      // Non-fatal — log but don't block the workflow
      console.error(`[sync] Failed to transition ${issueKey} to ${externalStatus}: ${e.message}`);
    }

    // Log hours if significant time was spent (> 1 minute)
    if (this.autoLogHours && timeSpent > 60 && fromStage) {
      const hours = Math.round(timeSpent / 360) / 10;
      try {
        const id = this.adapter.type === 'github' ? issueKey.replace('#', '') : issueKey;
        await this.adapter.logWork(id, timeSpent, `Time in ${fromStage}`);
      } catch (e) {
        console.error(`[sync] Failed to log work on ${issueKey}: ${e.message}`);
      }
    }

    // Add comment for the transition
    if (fromStage) {
      const comment = formatComment('stage_change', { from: fromStage, to: toRobosStage });
      try {
        const id = this.adapter.type === 'github' ? issueKey.replace('#', '') : issueKey;
        await this.adapter.addComment(id, comment);
      } catch (e) {
        console.error(`[sync] Failed to add comment on ${issueKey}: ${e.message}`);
      }
    }

    // Update known state
    this._knownStates.set(issueKey, externalStatus);

    this.onSync({ type: 'transition', issueKey, from: fromStage, to: toRobosStage, timeSpent });
    return { ok: true, timeSpent, externalStatus };
  }

  /**
   * Add a milestone comment to an issue.
   */
  async addMilestoneComment(issueKey, template, vars) {
    const comment = formatComment(template, vars);
    try {
      const id = this.adapter.type === 'github' ? issueKey.replace('#', '') : issueKey;
      await this.adapter.addComment(id, comment);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Poll for external changes and detect conflicts.
   */
  async pollExternalChanges(issueKeys) {
    const changes = [];

    for (const issueKey of issueKeys) {
      try {
        const id = this.adapter.type === 'github' ? issueKey.replace('#', '') : issueKey;
        const issue = await this.adapter.getIssue(id);
        const externalStatus = issue.status;
        const knownStatus = this._knownStates.get(issueKey);

        if (knownStatus && externalStatus !== knownStatus) {
          const robosStage = externalToRobos(this.statusMap, externalStatus);
          changes.push({
            issueKey,
            previousExternal: knownStatus,
            currentExternal: externalStatus,
            robosStage,
          });
          this._knownStates.set(issueKey, externalStatus);
          this.onConflict({
            issueKey,
            message: `${issueKey} was updated externally — status changed to ${externalStatus}`,
            robosStage,
          });
        } else if (!knownStatus) {
          this._knownStates.set(issueKey, externalStatus);
        }
      } catch (e) {
        console.error(`[sync] Failed to poll ${issueKey}: ${e.message}`);
      }
    }

    return changes;
  }

  /**
   * Start periodic polling for external changes.
   */
  startPolling(issueKeys) {
    this.stopPolling();
    this._polledKeys = issueKeys;
    this._pollTimer = setInterval(() => {
      this.pollExternalChanges(this._polledKeys);
    }, this.pollIntervalMs);
  }

  stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }
}

module.exports = {
  SyncEngine,
  robosToExternal,
  externalToRobos,
  recordTransition,
  readTracking,
  writeTracking,
  getTotalTimeSpent,
  formatComment,
  COMMENT_TEMPLATES,
};
