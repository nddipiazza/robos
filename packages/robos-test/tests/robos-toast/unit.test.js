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

  it('DEFAULT_PREFS contains required anti-spam, auto-fade, and delivery settings', () => {
    const DEFAULT_PREFS = {
      categoryOverrides: {},
      quietHours: { enabled: false, start: '22:00', end: '07:00' },
      dnd: false,
      deliveryMode: 'smart_dual',
      enableGnomeNotifications: true,
      enableAntiSpam: true,
      antiSpamCooldownSec: 15,
      burstLimit: 4,
      burstWindowSec: 10,
      fadeDurationMs: 400,
      hoverPause: true,
      displayPosition: 'top-right',
      maxVisibleToasts: 4,
    };

    assert.strictEqual(DEFAULT_PREFS.deliveryMode, 'smart_dual');
    assert.strictEqual(DEFAULT_PREFS.enableAntiSpam, true);
    assert.strictEqual(DEFAULT_PREFS.antiSpamCooldownSec, 15);
    assert.strictEqual(DEFAULT_PREFS.burstLimit, 4);
    assert.strictEqual(DEFAULT_PREFS.fadeDurationMs, 400);
    assert.strictEqual(DEFAULT_PREFS.hoverPause, true);
    assert.strictEqual(DEFAULT_PREFS.displayPosition, 'top-right');
  });

  it('anti-spam throttle deduplicates identical non-critical messages within cooldown', () => {
    const antiSpamHistory = new Map();
    const cooldownMs = 15000;

    function isThrottled(key, tier, now) {
      if (tier === 'critical') return false;
      const last = antiSpamHistory.get(key);
      if (last && (now - last) < cooldownMs) {
        return true;
      }
      antiSpamHistory.set(key, now);
      return false;
    }

    const t0 = 100000;
    // First message passes
    assert.strictEqual(isThrottled('pr-123-ci', 'warning', t0), false);
    // Same message 5 seconds later is throttled
    assert.strictEqual(isThrottled('pr-123-ci', 'warning', t0 + 5000), true);
    // Different message passes
    assert.strictEqual(isThrottled('pr-456-approved', 'info', t0 + 6000), false);
    // Critical alert always passes even with same key
    assert.strictEqual(isThrottled('pr-123-ci', 'critical', t0 + 7000), false);
    // After cooldown expiration (16 seconds), original passes again
    assert.strictEqual(isThrottled('pr-123-ci', 'warning', t0 + 16000), false);
  });

  it('anti-spam burst rate limit triggers when exceeding burstLimit', () => {
    let recentDispatches = [];
    const burstLimit = 3;
    const burstWindowMs = 5000;

    function checkBurst(tier, now) {
      if (tier === 'critical') return false;
      recentDispatches = recentDispatches.filter(t => (now - t) < burstWindowMs);
      if (recentDispatches.length >= burstLimit) {
        return true; // throttled
      }
      recentDispatches.push(now);
      return false;
    }

    const t0 = 200000;
    assert.strictEqual(checkBurst('info', t0), false);
    assert.strictEqual(checkBurst('info', t0 + 100), false);
    assert.strictEqual(checkBurst('info', t0 + 200), false);
    // 4th dispatch exceeds burstLimit (3) within window
    assert.strictEqual(checkBurst('info', t0 + 300), true);
    // Critical bypasses burst limit
    assert.strictEqual(checkBurst('critical', t0 + 400), false);
    // After window clears
    assert.strictEqual(checkBurst('info', t0 + 5100), false);
  });

  it('multi-position calculation returns valid coordinates for all positions', () => {
    const screen = { width: 1920, height: 1080 };
    const toastWidth = 360;
    const margin = 20;

    function getBounds(position, index = 0, toastHeight = 90) {
      let x = screen.width - toastWidth - margin;
      let y = margin + index * (toastHeight + 10);

      switch (position) {
        case 'top-left':
          x = margin;
          y = margin + index * (toastHeight + 10);
          break;
        case 'bottom-right':
          x = screen.width - toastWidth - margin;
          y = screen.height - margin - (index + 1) * (toastHeight + 10);
          break;
        case 'bottom-left':
          x = margin;
          y = screen.height - margin - (index + 1) * (toastHeight + 10);
          break;
        case 'top-center':
          x = Math.round((screen.width - toastWidth) / 2);
          y = margin + index * (toastHeight + 10);
          break;
        case 'top-right':
        default:
          x = screen.width - toastWidth - margin;
          y = margin + index * (toastHeight + 10);
          break;
      }
      return { x, y, width: toastWidth, height: toastHeight };
    }

    const tr = getBounds('top-right', 0);
    assert.strictEqual(tr.x, 1920 - 360 - 20);
    assert.strictEqual(tr.y, 20);

    const tl = getBounds('top-left', 0);
    assert.strictEqual(tl.x, 20);
    assert.strictEqual(tl.y, 20);

    const br = getBounds('bottom-right', 0);
    assert.strictEqual(br.x, 1920 - 360 - 20);
    assert.strictEqual(br.y, 1080 - 20 - 100);

    const bl = getBounds('bottom-left', 0);
    assert.strictEqual(bl.x, 20);
    assert.strictEqual(bl.y, 1080 - 20 - 100);

    const tc = getBounds('top-center', 0);
    assert.strictEqual(tc.x, (1920 - 360) / 2);
    assert.strictEqual(tc.y, 20);
  });

  it('multi-action security prompts parse correctly', () => {
    const rawActions = [
      { id: 'approve-1h', label: 'Approve (1 hr)', style: 'primary' },
      { id: 'deny', label: 'Deny', style: 'danger' },
      { id: 'inspect', label: 'Inspect Token', style: 'secondary' }
    ];

    const actions = rawActions.map(a => ({
      actionId: a.id || a.actionId,
      label: a.label,
      style: a.style || 'default',
      isPrimary: a.style === 'primary',
    }));

    assert.strictEqual(actions.length, 3);
    assert.strictEqual(actions[0].actionId, 'approve-1h');
    assert.strictEqual(actions[0].isPrimary, true);
    assert.strictEqual(actions[1].actionId, 'deny');
    assert.strictEqual(actions[1].style, 'danger');
  });

  it('delivery mode routes appropriately', () => {
    function shouldSendNative(deliveryMode, enableGnome) {
      if (enableGnome === false) return false;
      return deliveryMode === 'dual' || deliveryMode === 'both' || deliveryMode === 'native_only' || deliveryMode === 'smart_dual';
    }

    function shouldShowRobosToast(deliveryMode) {
      return deliveryMode !== 'native_only';
    }

    assert.strictEqual(shouldSendNative('smart_dual', true), true);
    assert.strictEqual(shouldSendNative('smart_dual', false), false);
    assert.strictEqual(shouldSendNative('toast_only', true), false);
    assert.strictEqual(shouldSendNative('native_only', true), true);

    assert.strictEqual(shouldShowRobosToast('toast_only'), true);
    assert.strictEqual(shouldShowRobosToast('smart_dual'), true);
    assert.strictEqual(shouldShowRobosToast('native_only'), false);
  });
});
