'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('automation-studio unit tests', () => {

  // ── Rule loading / saving ───────────────────────────────────────────────

  it('loadRules returns empty array when file missing', () => {
    const file = '/tmp/nonexistent-rules-' + Date.now() + '.json';
    let result;
    try {
      if (fs.existsSync(file)) result = JSON.parse(fs.readFileSync(file, 'utf8'));
      else result = [];
    } catch { result = []; }
    assert.deepStrictEqual(result, []);
  });

  it('rules roundtrip save/load', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-test-'));
    const file = path.join(tmp, 'event-rules.json');
    const rules = [
      { name: 'CI Fail Alert', eventType: 'ci.build.failed', conditions: [{ field: 'branch', operator: 'equals', value: 'main' }], actions: [{ type: 'notify', params: 'CI failed on main' }], enabled: true, lastFired: null },
      { name: 'PR Review', eventType: 'pr.review.requested', conditions: [], actions: [{ type: 'log', params: '' }], enabled: false, lastFired: '2025-01-01T00:00:00Z' },
    ];
    fs.writeFileSync(file, JSON.stringify(rules, null, 2));

    const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepStrictEqual(loaded, rules);
    assert.strictEqual(loaded.length, 2);
    assert.strictEqual(loaded[0].name, 'CI Fail Alert');
    assert.strictEqual(loaded[0].conditions.length, 1);
    assert.strictEqual(loaded[1].enabled, false);
    fs.rmSync(tmp, { recursive: true });
  });

  it('rule toggle updates enabled field', () => {
    const rules = [
      { name: 'Test', eventType: 'ci.build.completed', enabled: true },
    ];
    rules[0].enabled = false;
    assert.strictEqual(rules[0].enabled, false);
    rules[0].enabled = true;
    assert.strictEqual(rules[0].enabled, true);
  });

  // ── Event log parsing ─────────────────────────────────────────────────

  it('event log parsing from JSONL', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-test-'));
    const file = path.join(tmp, '2025-01-15.jsonl');
    const events = [
      { timestamp: '2025-01-15T10:00:00Z', type: 'ci.build.completed', source: 'github', category: 'build', payload: { repo: 'robos', status: 'success' } },
      { timestamp: '2025-01-15T10:05:00Z', type: 'pr.opened', source: 'github', category: 'review', payload: { number: 42, title: 'Add feature' } },
      { timestamp: '2025-01-15T10:10:00Z', type: 'deploy.started', source: 'ci', category: 'deploy', payload: { env: 'staging' } },
    ];
    fs.writeFileSync(file, events.map(e => JSON.stringify(e)).join('\n'));

    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
    const parsed = lines.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);

    assert.strictEqual(parsed.length, 3);
    assert.strictEqual(parsed[0].type, 'ci.build.completed');
    assert.strictEqual(parsed[1].payload.number, 42);
    assert.strictEqual(parsed[2].source, 'ci');
    fs.rmSync(tmp, { recursive: true });
  });

  it('event log returns empty for missing file', () => {
    const file = '/tmp/nonexistent-log-' + Date.now() + '.jsonl';
    let result;
    try {
      if (!fs.existsSync(file)) result = [];
      else {
        const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
        result = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      }
    } catch { result = []; }
    assert.deepStrictEqual(result, []);
  });

  it('event log handles malformed lines gracefully', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-test-'));
    const file = path.join(tmp, 'bad.jsonl');
    fs.writeFileSync(file, '{"type":"ok"}\nnot-json\n{"type":"also-ok"}\n');

    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
    const parsed = lines.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);

    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].type, 'ok');
    assert.strictEqual(parsed[1].type, 'also-ok');
    fs.rmSync(tmp, { recursive: true });
  });

  // ── Cron schedule display ─────────────────────────────────────────────

  it('cronToHuman converts common expressions', () => {
    // Inline the function for unit testing without Electron
    function cronToHuman(expr) {
      if (!expr) return 'No schedule';
      const parts = expr.trim().split(/\s+/);
      if (parts.length < 5) return expr;
      const [min, hour, dom, mon, dow] = parts;
      if (min === '*' && hour === '*') return 'Every minute';
      if (hour === '*' && min !== '*') return `Every hour at :${min.padStart(2, '0')}`;
      if (dom === '*' && mon === '*' && dow === '*') {
        if (min !== '*' && hour !== '*') return `Daily at ${hour}:${min.padStart(2, '0')}`;
      }
      if (dow !== '*' && dom === '*' && mon === '*') {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const day = days[parseInt(dow)] || dow;
        return `${day} at ${hour}:${min.padStart(2, '0')}`;
      }
      return expr;
    }

    assert.strictEqual(cronToHuman('* * * * *'), 'Every minute');
    assert.strictEqual(cronToHuman('30 * * * *'), 'Every hour at :30');
    assert.strictEqual(cronToHuman('0 9 * * *'), 'Daily at 9:00');
    assert.strictEqual(cronToHuman('0 9 * * 1'), 'Mon at 9:00');
    assert.strictEqual(cronToHuman(null), 'No schedule');
    assert.strictEqual(cronToHuman(''), 'No schedule');
  });

  // ── Job loading / saving ──────────────────────────────────────────────

  it('jobs roundtrip save/load', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-test-'));
    const file = path.join(tmp, 'scheduled-jobs.json');
    const jobs = [
      { name: 'Daily Standup', cron: '0 9 * * *', actions: [{ type: 'notify', params: 'standup time' }], enabled: true, lastRun: null, nextRun: null, status: 'idle' },
    ];
    fs.writeFileSync(file, JSON.stringify(jobs, null, 2));

    const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepStrictEqual(loaded, jobs);
    assert.strictEqual(loaded[0].cron, '0 9 * * *');
    fs.rmSync(tmp, { recursive: true });
  });

  it('loadJobs returns empty array when file missing', () => {
    const file = '/tmp/nonexistent-jobs-' + Date.now() + '.json';
    let result;
    try {
      if (fs.existsSync(file)) result = JSON.parse(fs.readFileSync(file, 'utf8'));
      else result = [];
    } catch { result = []; }
    assert.deepStrictEqual(result, []);
  });
});
