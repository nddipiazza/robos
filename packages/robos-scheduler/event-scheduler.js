'use strict';

/**
 * EventScheduler — event-triggered execution with rate limiting and concurrency control.
 *
 * Subscribes to the event bus and uses the rule engine to match events
 * to agent triggers, enforcing concurrent session limits and rate limits.
 *
 * Options:
 *   ruleEngine      — RuleEngine instance
 *   eventBusClient  — EventBusClient instance
 *   maxConcurrent   — max concurrent event-triggered sessions (default: 3)
 *   maxPerHourPerRule — max executions per hour per rule (default: 10)
 *   actionTimeout   — default timeout in seconds (default: 300)
 */
class EventScheduler {
  constructor(opts = {}) {
    this.ruleEngine = opts.ruleEngine || null;
    this.eventBusClient = opts.eventBusClient || null;
    this.maxConcurrent = opts.maxConcurrent || 3;
    this.maxPerHourPerRule = opts.maxPerHourPerRule || 10;
    this.actionTimeout = opts.actionTimeout || 300;

    this._activeSessions = 0;
    this._rateTracker = new Map(); // ruleId -> [timestamps]
  }

  /**
   * Check if a rule has exceeded its rate limit.
   */
  isRateLimited(ruleId) {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    if (!this._rateTracker.has(ruleId)) {
      this._rateTracker.set(ruleId, []);
    }

    const timestamps = this._rateTracker.get(ruleId);
    // Prune old entries
    const recent = timestamps.filter(ts => ts > oneHourAgo);
    this._rateTracker.set(ruleId, recent);

    return recent.length >= this.maxPerHourPerRule;
  }

  /**
   * Record a rule execution for rate limiting.
   */
  recordExecution(ruleId) {
    if (!this._rateTracker.has(ruleId)) {
      this._rateTracker.set(ruleId, []);
    }
    this._rateTracker.get(ruleId).push(Date.now());
  }

  /**
   * Check if we can start a new session.
   */
  canStartSession() {
    return this._activeSessions < this.maxConcurrent;
  }

  /**
   * Process an event through the rule engine with rate/concurrency checks.
   */
  async processEvent(event) {
    if (!this.ruleEngine) return [];

    const matches = this.ruleEngine.evaluate(event);
    const results = [];

    for (const match of matches) {
      const ruleId = match.rule.id;

      // Check rate limit
      if (this.isRateLimited(ruleId)) {
        results.push({
          ruleId,
          skipped: true,
          reason: 'Rate limit exceeded',
        });
        continue;
      }

      // Check concurrency
      if (!this.canStartSession()) {
        results.push({
          ruleId,
          skipped: true,
          reason: 'Concurrent session limit reached',
        });
        continue;
      }

      this._activeSessions++;
      this.recordExecution(ruleId);

      try {
        const result = await this.ruleEngine.processEvent(event);
        results.push({ ruleId, ...result });
      } catch (err) {
        results.push({ ruleId, error: err.message });
      } finally {
        this._activeSessions--;
      }
    }

    return results;
  }

  /**
   * Start the event scheduler.
   */
  async start() {
    if (this.eventBusClient) {
      try {
        await this.eventBusClient.connect();
        await this.eventBusClient.subscribe({}, (event) => {
          this.processEvent(event).catch(err => {
            console.error(`Event scheduler error: ${err.message}`);
          });
        });
      } catch (err) {
        console.error(`Failed to connect to event bus: ${err.message}`);
      }
    }
  }

  /**
   * Stop the event scheduler.
   */
  stop() {
    if (this.eventBusClient) {
      this.eventBusClient.disconnect();
    }
  }

  /**
   * Get current active session count.
   */
  getActiveSessions() {
    return this._activeSessions;
  }

  /**
   * Get rate limit info for a rule.
   */
  getRateInfo(ruleId) {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const timestamps = (this._rateTracker.get(ruleId) || []).filter(ts => ts > oneHourAgo);
    return {
      ruleId,
      executionsInLastHour: timestamps.length,
      limit: this.maxPerHourPerRule,
      remaining: Math.max(0, this.maxPerHourPerRule - timestamps.length),
    };
  }
}

module.exports = { EventScheduler };
