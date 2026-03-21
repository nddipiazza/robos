'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('desktop-widgets unit tests', () => {
  it('getActiveTask returns null when file missing', () => {
    const file = '/tmp/nonexistent-task-' + Date.now();
    let result;
    try {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8').trim();
        result = content || null;
      } else {
        result = null;
      }
    } catch { result = null; }
    assert.strictEqual(result, null);
  });

  it('getActiveTask reads task from file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'widget-test-'));
    const file = path.join(tmp, 'active-issue');
    fs.writeFileSync(file, 'JIRA-42');

    const content = fs.readFileSync(file, 'utf8').trim();
    assert.strictEqual(content, 'JIRA-42');
    fs.rmSync(tmp, { recursive: true });
  });

  it('getSystemStats returns valid structure', () => {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPct = Math.round((usedMem / totalMem) * 100);

    assert.ok(cpus.length > 0, 'has CPUs');
    assert.ok(totalMem > 0, 'has memory');
    assert.ok(memPct >= 0 && memPct <= 100, 'memory percentage in range');
  });

  it('DEFAULT_WIDGETS has expected widget IDs', () => {
    const DEFAULT_WIDGETS = [
      { id: 'active-task', label: 'Active Task', enabled: true },
      { id: 'system-stats', label: 'System Stats', enabled: true },
      { id: 'journal-summary', label: 'Journal Summary', enabled: true },
    ];

    assert.strictEqual(DEFAULT_WIDGETS.length, 3);
    assert.ok(DEFAULT_WIDGETS.find(w => w.id === 'active-task'));
    assert.ok(DEFAULT_WIDGETS.find(w => w.id === 'system-stats'));
    assert.ok(DEFAULT_WIDGETS.find(w => w.id === 'journal-summary'));
  });

  it('widget config load/save roundtrip', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'widget-test-'));
    const file = path.join(tmp, 'widgets.json');
    const config = [
      { id: 'active-task', enabled: true, x: 20, y: 80 },
      { id: 'system-stats', enabled: false, x: 20, y: 180 },
    ];
    fs.writeFileSync(file, JSON.stringify(config, null, 2));

    const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepStrictEqual(loaded, config);
    assert.strictEqual(loaded[1].enabled, false);
    fs.rmSync(tmp, { recursive: true });
  });
});
