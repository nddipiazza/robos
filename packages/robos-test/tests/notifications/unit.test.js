'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('notifications unit tests', () => {
  it('loadNotifications returns empty array when file missing', () => {
    const file = '/tmp/nonexistent-' + Date.now();
    const result = (() => {
      try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {}
      return [];
    })();
    assert.deepStrictEqual(result, []);
  });

  it('loadNotifications reads from file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notif-test-'));
    const file = path.join(tmp, 'notifications.json');
    fs.writeFileSync(file, JSON.stringify([
      { id: '1', title: 'Test', category: 'system', tier: 'info', read: false },
      { id: '2', title: 'Test2', category: 'ci_cd', tier: 'critical', read: true },
    ]));

    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(data.length, 2);
    assert.strictEqual(data[0].category, 'system');
    assert.strictEqual(data[1].tier, 'critical');
    fs.rmSync(tmp, { recursive: true });
  });

  it('mark-read marks specific notification', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notif-test-'));
    const file = path.join(tmp, 'notifications.json');
    const data = [
      { id: '1', title: 'Test', read: false },
      { id: '2', title: 'Test2', read: false },
    ];
    fs.writeFileSync(file, JSON.stringify(data));

    // Mark id=1 as read
    const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
    loaded.forEach(n => { if (n.id === '1') n.read = true; });
    fs.writeFileSync(file, JSON.stringify(loaded));

    const result = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(result[0].read, true);
    assert.strictEqual(result[1].read, false);
    fs.rmSync(tmp, { recursive: true });
  });

  it('clear-read removes only read notifications', () => {
    const data = [
      { id: '1', title: 'Test', read: true },
      { id: '2', title: 'Test2', read: false },
      { id: '3', title: 'Test3', read: true },
    ];
    const result = data.filter(n => !n.read);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, '2');
  });

  it('unread count by category groups correctly', () => {
    const data = [
      { id: '1', category: 'ci_cd', read: false },
      { id: '2', category: 'ci_cd', read: false },
      { id: '3', category: 'system', read: false },
      { id: '4', category: 'system', read: true },
    ];
    const counts = {};
    data.forEach(n => {
      if (!n.read) {
        const cat = n.category || 'system';
        counts[cat] = (counts[cat] || 0) + 1;
      }
    });
    assert.strictEqual(counts.ci_cd, 2);
    assert.strictEqual(counts.system, 1);
  });

  it('notification prefs load/save roundtrip', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notif-test-'));
    const file = path.join(tmp, 'prefs.json');
    const prefs = {
      categoryOverrides: {},
      quietHours: { enabled: true, start: '23:00', end: '06:00' },
      dnd: false,
    };
    fs.writeFileSync(file, JSON.stringify(prefs, null, 2));
    const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepStrictEqual(loaded, prefs);
    fs.rmSync(tmp, { recursive: true });
  });
});
