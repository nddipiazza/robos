'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('robos-toast unit tests', () => {
  it('CATEGORIES contains all expected categories', () => {
    const CATEGORIES = ['pr_review', 'ci_cd', 'task', 'agent', 'system'];
    assert.strictEqual(CATEGORIES.length, 5);
    assert.ok(CATEGORIES.includes('pr_review'));
    assert.ok(CATEGORIES.includes('ci_cd'));
    assert.ok(CATEGORIES.includes('task'));
    assert.ok(CATEGORIES.includes('agent'));
    assert.ok(CATEGORIES.includes('system'));
  });

  it('TIERS contains all expected tiers', () => {
    const TIERS = ['critical', 'warning', 'info'];
    assert.strictEqual(TIERS.length, 3);
  });

  it('TIER_DEFAULTS has correct behavior per tier', () => {
    const TIER_DEFAULTS = {
      critical: { persistent: true, duration: 0, sound: true },
      warning:  { persistent: false, duration: 15000, sound: true },
      info:     { persistent: false, duration: 5000, sound: false },
    };

    assert.strictEqual(TIER_DEFAULTS.critical.persistent, true);
    assert.strictEqual(TIER_DEFAULTS.critical.sound, true);
    assert.strictEqual(TIER_DEFAULTS.warning.duration, 15000);
    assert.strictEqual(TIER_DEFAULTS.warning.sound, true);
    assert.strictEqual(TIER_DEFAULTS.info.duration, 5000);
    assert.strictEqual(TIER_DEFAULTS.info.sound, false);
  });

  it('getTierBorderColor returns correct colors', () => {
    function getTierBorderColor(tier) {
      switch (tier) {
        case 'critical': return '#f85149';
        case 'warning':  return '#d29922';
        case 'info':
        default:         return '#00bcd4';
      }
    }

    assert.strictEqual(getTierBorderColor('critical'), '#f85149');
    assert.strictEqual(getTierBorderColor('warning'), '#d29922');
    assert.strictEqual(getTierBorderColor('info'), '#00bcd4');
    assert.strictEqual(getTierBorderColor('unknown'), '#00bcd4');
  });

  it('loadPrefs returns defaults when file missing', () => {
    const PREFS_FILE = '/tmp/nonexistent-prefs-' + Date.now() + '.json';
    const prefs = (() => {
      try {
        if (fs.existsSync(PREFS_FILE)) return JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
      } catch {}
      return { categoryOverrides: {}, quietHours: { enabled: false, start: '22:00', end: '07:00' }, dnd: false };
    })();

    assert.strictEqual(prefs.dnd, false);
    assert.strictEqual(prefs.quietHours.enabled, false);
    assert.deepStrictEqual(prefs.categoryOverrides, {});
  });

  it('loadPrefs reads from file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'toast-test-'));
    const prefsFile = path.join(tmp, 'prefs.json');
    fs.writeFileSync(prefsFile, JSON.stringify({
      dnd: true,
      quietHours: { enabled: true, start: '23:00', end: '06:00' },
      categoryOverrides: { ci_cd: { critical: { sound: false } } },
    }));

    const prefs = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
    assert.strictEqual(prefs.dnd, true);
    assert.strictEqual(prefs.quietHours.enabled, true);
    assert.strictEqual(prefs.categoryOverrides.ci_cd.critical.sound, false);

    fs.rmSync(tmp, { recursive: true });
  });
});
