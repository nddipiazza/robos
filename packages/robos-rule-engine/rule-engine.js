'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { evaluateConditions } = require('./conditions');
const { DEFAULT_RULES } = require('./defaults');

/**
 * RuleEngine — evaluates events against user-defined rules and executes actions.
 *
 * Options:
 *   rulesPath     — path to event-rules.json
 *   logDir        — path for rule match logs
 *   actionRegistry — ActionRegistry instance for executing actions
 *   eventBusClient — EventBusClient for subscribing to events (optional)
 */
class RuleEngine {
  constructor(opts = {}) {
    this.rulesPath = opts.rulesPath || path.join(os.homedir(), '.config', 'robos', 'event-rules.json');
    this.logDir = opts.logDir || path.join(os.homedir(), '.config', 'robos', 'event-log');
    this.actionRegistry = opts.actionRegistry || null;
    this.eventBusClient = opts.eventBusClient || null;

    this._rules = [];
    this._watcher = null;
  }

  /**
   * Load rules from the rules file.
   * If file doesn't exist, create it with default rules.
   */
  loadRules() {
    try {
      if (fs.existsSync(this.rulesPath)) {
        const content = fs.readFileSync(this.rulesPath, 'utf8');
        const parsed = JSON.parse(content);
        this._rules = Array.isArray(parsed) ? parsed : [];
      } else {
        // Write defaults
        fs.mkdirSync(path.dirname(this.rulesPath), { recursive: true });
        fs.writeFileSync(this.rulesPath, JSON.stringify(DEFAULT_RULES, null, 2));
        this._rules = [...DEFAULT_RULES];
      }
    } catch (err) {
      // Malformed JSON — keep existing rules, log error
      console.error(`Failed to load rules: ${err.message}`);
    }
    return this._rules;
  }

  /**
   * Get current rules.
   */
  getRules() {
    return this._rules;
  }

  /**
   * Watch rules file for changes (hot-reload).
   */
  watchRules() {
    if (this._watcher) return;
    try {
      this._watcher = fs.watch(this.rulesPath, (eventType) => {
        if (eventType === 'change') {
          this.loadRules();
        }
      });
    } catch (_) {
      // File might not exist yet
    }
  }

  /**
   * Stop watching rules file.
   */
  stopWatching() {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
  }

  /**
   * Evaluate an event against all rules.
   * Returns array of { rule, actions } for all matching rules.
   */
  evaluate(event) {
    const matches = [];

    for (const rule of this._rules) {
      // Skip disabled rules
      if (!rule.enabled) continue;

      // Skip malformed rules
      if (!rule.trigger || !rule.trigger.eventType) continue;

      // Check event type match
      if (rule.trigger.eventType !== event.type) continue;

      // Check conditions
      if (!evaluateConditions(event, rule.trigger.conditions)) continue;

      // Check cooldown
      if (rule.cooldown && rule.cooldown > 0 && rule.lastFired) {
        const elapsed = (Date.now() - new Date(rule.lastFired).getTime()) / 1000;
        if (elapsed < rule.cooldown) continue;
      }

      matches.push({ rule, actions: rule.actions || [] });
    }

    return matches;
  }

  /**
   * Process an event: evaluate rules, execute actions, log matches.
   */
  async processEvent(event) {
    const matches = this.evaluate(event);
    const results = [];

    for (const match of matches) {
      const actionResults = [];
      const steps = [];

      for (const action of match.actions) {
        if (this.actionRegistry) {
          const context = { ...event, steps };
          const result = await this.actionRegistry.execute(action.type, action.params || {}, context);
          actionResults.push({ type: action.type, ...result });
          steps.push(result);
        } else {
          actionResults.push({ type: action.type, skipped: true, reason: 'No action registry' });
        }
      }

      // Update lastFired
      match.rule.lastFired = new Date().toISOString();
      this._persistRules();

      // Log match
      this._logMatch(event, match.rule, actionResults);

      results.push({
        ruleId: match.rule.id,
        ruleName: match.rule.name,
        actions: actionResults,
      });
    }

    return results;
  }

  /**
   * Persist rules back to disk (e.g., to update lastFired).
   */
  _persistRules() {
    try {
      fs.mkdirSync(path.dirname(this.rulesPath), { recursive: true });
      fs.writeFileSync(this.rulesPath, JSON.stringify(this._rules, null, 2));
    } catch (_) {
      // Non-critical
    }
  }

  /**
   * Log a rule match to rule-matches.jsonl.
   */
  _logMatch(event, rule, actionResults) {
    try {
      fs.mkdirSync(this.logDir, { recursive: true });
      const logFile = path.join(this.logDir, 'rule-matches.jsonl');
      const entry = {
        ts: new Date().toISOString(),
        eventId: event.id,
        eventType: event.type,
        ruleId: rule.id,
        ruleName: rule.name,
        actions: actionResults.map(a => ({ type: a.type, success: a.success })),
      };
      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    } catch (_) {
      // Non-critical
    }
  }

  /**
   * Start the rule engine: load rules, optionally subscribe to event bus.
   */
  async start() {
    this.loadRules();
    this.watchRules();

    if (this.eventBusClient) {
      try {
        await this.eventBusClient.connect();
        await this.eventBusClient.subscribe({}, (event) => {
          this.processEvent(event).catch(err => {
            console.error(`Rule engine error: ${err.message}`);
          });
        });
      } catch (err) {
        console.error(`Failed to connect to event bus: ${err.message}`);
      }
    }
  }

  /**
   * Stop the rule engine.
   */
  stop() {
    this.stopWatching();
    if (this.eventBusClient) {
      this.eventBusClient.disconnect();
    }
  }
}

module.exports = { RuleEngine };
