'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseCron, nextRun } = require('./cron-parser');

/**
 * CronScheduler — loads and executes cron-based recurring jobs.
 *
 * Options:
 *   jobsPath       — path to scheduled-jobs.json
 *   historyDir     — path for job history files
 *   actionRegistry — ActionRegistry instance
 *   eventBus       — EventBus instance (for emitting events) or null
 *   tickInterval   — ms between schedule checks (default: 60000)
 */
class CronScheduler {
  constructor(opts = {}) {
    this.jobsPath = opts.jobsPath || path.join(os.homedir(), '.config', 'robos', 'scheduled-jobs.json');
    this.historyDir = opts.historyDir || path.join(os.homedir(), '.config', 'robos', 'job-history');
    this.actionRegistry = opts.actionRegistry || null;
    this.eventBus = opts.eventBus || null;
    this.tickInterval = opts.tickInterval || 60000;

    this._jobs = [];
    this._timer = null;
    this._watcher = null;
  }

  /**
   * Load jobs from disk.
   */
  loadJobs() {
    try {
      if (fs.existsSync(this.jobsPath)) {
        const content = fs.readFileSync(this.jobsPath, 'utf8');
        this._jobs = JSON.parse(content);
        if (!Array.isArray(this._jobs)) this._jobs = [];
      } else {
        this._jobs = [];
      }
    } catch (err) {
      console.error(`Failed to load jobs: ${err.message}`);
    }

    // Compute nextRun for all enabled jobs
    for (const job of this._jobs) {
      if (job.enabled && job.schedule) {
        try {
          const next = nextRun(job.schedule);
          job.nextRun = next ? next.toISOString() : null;
        } catch (_) {
          // Invalid cron — skip
        }
      }
    }

    return this._jobs;
  }

  /**
   * Get current jobs.
   */
  getJobs() {
    return this._jobs;
  }

  /**
   * Execute a job immediately.
   */
  async executeJob(job) {
    const results = [];
    let overallStatus = 'success';

    for (const action of (job.actions || [])) {
      if (this.actionRegistry) {
        try {
          const result = await this.actionRegistry.execute(action.type, action.params || {}, {});
          results.push({ type: action.type, ...result });
          if (!result.success) overallStatus = 'error';
        } catch (err) {
          results.push({ type: action.type, success: false, error: err.message });
          overallStatus = 'error';
        }
      }
    }

    // Update job metadata
    job.lastRun = new Date().toISOString();
    job.lastStatus = overallStatus;

    // Compute next run
    if (job.schedule) {
      try {
        const next = nextRun(job.schedule);
        job.nextRun = next ? next.toISOString() : null;
      } catch (_) { /* ignore */ }
    }

    // Persist jobs
    this._persistJobs();

    // Record history
    this._recordHistory(job, results, overallStatus);

    // Track consecutive failures
    this._checkConsecutiveFailures(job);

    // Emit event to bus
    if (this.eventBus) {
      try {
        this.eventBus.publish({
          type: 'scheduled_job_executed',
          source: 'robos-scheduler',
          payload: { jobId: job.id, jobName: job.name, status: overallStatus },
        });
      } catch (_) { /* ignore */ }
    }

    return { status: overallStatus, actions: results };
  }

  /**
   * Run a job immediately by ID.
   */
  async runNow(jobId) {
    const job = this._jobs.find(j => j.id === jobId);
    if (!job) return { error: `Job not found: ${jobId}` };
    return this.executeJob(job);
  }

  /**
   * Check the schedule and run due jobs.
   */
  async tick() {
    const now = new Date();

    for (const job of this._jobs) {
      if (!job.enabled || !job.nextRun) continue;

      const nextRunDate = new Date(job.nextRun);
      if (now >= nextRunDate) {
        try {
          await this.executeJob(job);
        } catch (err) {
          console.error(`Job ${job.id} failed: ${err.message}`);
        }
      }
    }
  }

  /**
   * Start the scheduler loop.
   */
  start() {
    this.loadJobs();
    this._watchJobs();

    // Initial tick
    this.tick();

    this._timer = setInterval(() => this.tick(), this.tickInterval);
  }

  /**
   * Stop the scheduler.
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
  }

  /**
   * Watch jobs file for changes.
   */
  _watchJobs() {
    try {
      if (fs.existsSync(this.jobsPath)) {
        this._watcher = fs.watch(this.jobsPath, (eventType) => {
          if (eventType === 'change') {
            this.loadJobs();
          }
        });
      }
    } catch (_) { /* ignore */ }
  }

  /**
   * Persist jobs to disk.
   */
  _persistJobs() {
    try {
      fs.mkdirSync(path.dirname(this.jobsPath), { recursive: true });
      fs.writeFileSync(this.jobsPath, JSON.stringify(this._jobs, null, 2));
    } catch (_) { /* ignore */ }
  }

  /**
   * Record a job execution in the history file.
   */
  _recordHistory(job, results, status) {
    try {
      fs.mkdirSync(this.historyDir, { recursive: true });
      const histFile = path.join(this.historyDir, `${job.id}.jsonl`);
      const entry = {
        ts: new Date().toISOString(),
        status,
        actions: results.map(r => ({ type: r.type, success: r.success })),
      };
      fs.appendFileSync(histFile, JSON.stringify(entry) + '\n');

      // Trim to last 50 entries
      const lines = fs.readFileSync(histFile, 'utf8').trim().split('\n');
      if (lines.length > 50) {
        fs.writeFileSync(histFile, lines.slice(-50).join('\n') + '\n');
      }
    } catch (_) { /* ignore */ }
  }

  /**
   * Check for 3+ consecutive failures and emit warning.
   */
  _checkConsecutiveFailures(job) {
    try {
      const histFile = path.join(this.historyDir, `${job.id}.jsonl`);
      if (!fs.existsSync(histFile)) return;

      const lines = fs.readFileSync(histFile, 'utf8').trim().split('\n');
      const recent = lines.slice(-3);
      if (recent.length < 3) return;

      const allFailed = recent.every(line => {
        try {
          return JSON.parse(line).status === 'error';
        } catch (_) {
          return false;
        }
      });

      if (allFailed && this.actionRegistry) {
        this.actionRegistry.execute('notify', {
          tier: 'warning',
          category: 'system',
          title: `Job failing: ${job.name}`,
          message: `${job.name} has failed 3+ times consecutively`,
        }, {}).catch(() => {});
      }
    } catch (_) { /* ignore */ }
  }
}

module.exports = { CronScheduler };
