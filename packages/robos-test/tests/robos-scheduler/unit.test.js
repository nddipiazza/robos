'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SCHEDULER_PATH = path.resolve(__dirname, '../../../robos-scheduler');
const { parseField, parseCron, matchesCron, nextRun, CronScheduler, EventScheduler } = require(SCHEDULER_PATH);

// ── Cron parser: parseField ─────────────────────────────────────────────────

describe('parseField', () => {
  it('parses wildcard', () => {
    const result = parseField('*', 0, 5);
    assert.deepStrictEqual(result, [0, 1, 2, 3, 4, 5]);
  });

  it('parses single value', () => {
    assert.deepStrictEqual(parseField('5', 0, 59), [5]);
  });

  it('parses range', () => {
    assert.deepStrictEqual(parseField('1-5', 0, 59), [1, 2, 3, 4, 5]);
  });

  it('parses list', () => {
    assert.deepStrictEqual(parseField('1,3,5', 0, 59), [1, 3, 5]);
  });

  it('parses step', () => {
    const result = parseField('*/15', 0, 59);
    assert.deepStrictEqual(result, [0, 15, 30, 45]);
  });

  it('parses range with step', () => {
    const result = parseField('0-30/10', 0, 59);
    assert.deepStrictEqual(result, [0, 10, 20, 30]);
  });

  it('parses weekday range (1-5 for Mon-Fri)', () => {
    assert.deepStrictEqual(parseField('1-5', 0, 6), [1, 2, 3, 4, 5]);
  });
});

// ── Cron parser: parseCron ──────────────────────────────────────────────────

describe('parseCron', () => {
  it('parses every minute', () => {
    const s = parseCron('* * * * *');
    assert.strictEqual(s.minutes.length, 60);
    assert.strictEqual(s.hours.length, 24);
  });

  it('parses specific time (0 9 * * 1-5)', () => {
    const s = parseCron('0 9 * * 1-5');
    assert.deepStrictEqual(s.minutes, [0]);
    assert.deepStrictEqual(s.hours, [9]);
    assert.strictEqual(s.days.length, 31);
    assert.strictEqual(s.months.length, 12);
    assert.deepStrictEqual(s.weekdays, [1, 2, 3, 4, 5]);
  });

  it('parses every 15 minutes', () => {
    const s = parseCron('*/15 * * * *');
    assert.deepStrictEqual(s.minutes, [0, 15, 30, 45]);
  });

  it('throws for invalid expression', () => {
    assert.throws(() => parseCron('bad'), /Invalid cron expression/);
  });
});

// ── Cron matcher: matchesCron ───────────────────────────────────────────────

describe('matchesCron', () => {
  it('matches every-minute schedule', () => {
    const schedule = parseCron('* * * * *');
    assert.strictEqual(matchesCron(new Date(), schedule), true);
  });

  it('matches specific minute', () => {
    const schedule = parseCron('30 * * * *');
    const date = new Date('2026-03-21T10:30:00Z');
    assert.strictEqual(matchesCron(date, schedule), true);
  });

  it('does not match wrong minute', () => {
    const schedule = parseCron('30 * * * *');
    const date = new Date('2026-03-21T10:15:00Z');
    assert.strictEqual(matchesCron(date, schedule), false);
  });

  it('matches weekday correctly', () => {
    const schedule = parseCron('0 9 * * 1-5');
    // 2026-03-23 is a Monday (day 1)
    const monday = new Date('2026-03-23T09:00:00');
    assert.strictEqual(matchesCron(monday, schedule), true);

    // 2026-03-22 is a Sunday (day 0)
    const sunday = new Date('2026-03-22T09:00:00');
    assert.strictEqual(matchesCron(sunday, schedule), false);
  });
});

// ── nextRun calculation ─────────────────────────────────────────────────────

describe('nextRun', () => {
  it('computes next run for every-minute schedule', () => {
    const now = new Date('2026-03-21T10:30:00Z');
    const next = nextRun('* * * * *', now);
    assert.ok(next);
    assert.strictEqual(next.getMinutes(), 31);
  });

  it('computes next run for specific time', () => {
    const now = new Date('2026-03-21T08:00:00Z');
    const next = nextRun('0 9 * * *', now);
    assert.ok(next);
    assert.strictEqual(next.getHours(), 9);
    assert.strictEqual(next.getMinutes(), 0);
  });

  it('wraps to next day if time has passed', () => {
    const now = new Date('2026-03-21T10:00:00Z');
    const next = nextRun('0 9 * * *', now);
    assert.ok(next);
    // Should be next day at 9:00
    assert.ok(next > now);
    assert.strictEqual(next.getHours(), 9);
  });

  it('computes next run for every 15 minutes', () => {
    const now = new Date('2026-03-21T10:07:00Z');
    const next = nextRun('*/15 * * * *', now);
    assert.ok(next);
    assert.strictEqual(next.getMinutes(), 15);
  });

  it('respects weekday filter', () => {
    // 2026-03-21 is a Saturday (day 6)
    const saturday = new Date('2026-03-21T10:00:00Z');
    const next = nextRun('0 9 * * 1-5', saturday);
    assert.ok(next);
    // Should land on Monday (day 1)
    assert.strictEqual(next.getDay(), 1);
  });
});

// ── Rate limiting tests ─────────────────────────────────────────────────────

describe('EventScheduler Rate Limiting', () => {
  it('isRateLimited returns false initially', () => {
    const scheduler = new EventScheduler({ maxPerHourPerRule: 5 });
    assert.strictEqual(scheduler.isRateLimited('rule_1'), false);
  });

  it('isRateLimited returns true after exceeding limit', () => {
    const scheduler = new EventScheduler({ maxPerHourPerRule: 3 });
    scheduler.recordExecution('rule_1');
    scheduler.recordExecution('rule_1');
    scheduler.recordExecution('rule_1');
    assert.strictEqual(scheduler.isRateLimited('rule_1'), true);
  });

  it('rate limit is per-rule', () => {
    const scheduler = new EventScheduler({ maxPerHourPerRule: 2 });
    scheduler.recordExecution('rule_1');
    scheduler.recordExecution('rule_1');
    assert.strictEqual(scheduler.isRateLimited('rule_1'), true);
    assert.strictEqual(scheduler.isRateLimited('rule_2'), false);
  });

  it('getRateInfo returns correct info', () => {
    const scheduler = new EventScheduler({ maxPerHourPerRule: 10 });
    scheduler.recordExecution('rule_1');
    scheduler.recordExecution('rule_1');
    const info = scheduler.getRateInfo('rule_1');
    assert.strictEqual(info.executionsInLastHour, 2);
    assert.strictEqual(info.limit, 10);
    assert.strictEqual(info.remaining, 8);
  });
});

// ── Concurrency tests ───────────────────────────────────────────────────────

describe('EventScheduler Concurrency', () => {
  it('canStartSession returns true when under limit', () => {
    const scheduler = new EventScheduler({ maxConcurrent: 3 });
    assert.strictEqual(scheduler.canStartSession(), true);
  });

  it('getActiveSessions returns 0 initially', () => {
    const scheduler = new EventScheduler();
    assert.strictEqual(scheduler.getActiveSessions(), 0);
  });
});

// ── CronScheduler tests ────────────────────────────────────────────────────

describe('CronScheduler', () => {
  let scheduler, tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-test-'));
  });

  after(() => {
    if (scheduler) scheduler.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads jobs from JSON file', () => {
    const jobsPath = path.join(tmpDir, 'jobs.json');
    fs.writeFileSync(jobsPath, JSON.stringify([
      { id: 'job_1', name: 'Test Job', enabled: true, schedule: '*/15 * * * *', actions: [] },
      { id: 'job_2', name: 'Disabled', enabled: false, schedule: '0 9 * * *', actions: [] },
    ]));

    scheduler = new CronScheduler({
      jobsPath,
      historyDir: path.join(tmpDir, 'history'),
    });

    const jobs = scheduler.loadJobs();
    assert.strictEqual(jobs.length, 2);
    assert.ok(jobs[0].nextRun); // enabled job gets nextRun computed
  });

  it('returns empty array when file does not exist', () => {
    const s = new CronScheduler({
      jobsPath: path.join(tmpDir, 'nonexistent.json'),
      historyDir: path.join(tmpDir, 'history'),
    });
    const jobs = s.loadJobs();
    assert.deepStrictEqual(jobs, []);
  });
});
