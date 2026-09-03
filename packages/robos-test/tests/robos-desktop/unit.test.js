'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('robos-desktop unit tests', () => {
  const BASE_BTN_PX   = 52;
  const SCALE_MIN     = 0.55;
  const SCALE_MAX     = 1.6;
  const SCALE_DEFAULT = 1.0;

  function clampScale(scale) {
    return Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale));
  }

  function computeBtnPx(scale) {
    const clamped = clampScale(scale);
    return Math.round(BASE_BTN_PX * clamped);
  }

  describe('Dock scale calculations', () => {
    it('computes default button size at scale 1.0', () => {
      assert.strictEqual(computeBtnPx(SCALE_DEFAULT), 52);
    });

    it('scales button up for larger dock', () => {
      assert.strictEqual(computeBtnPx(1.5), 78);
    });

    it('scales button down for smaller dock', () => {
      assert.strictEqual(computeBtnPx(0.75), 39);
    });

    it('clamps to minimum scale (0.55)', () => {
      assert.strictEqual(clampScale(0.2), SCALE_MIN);
      assert.strictEqual(computeBtnPx(0.2), Math.round(52 * 0.55));
    });

    it('clamps to maximum scale (1.6)', () => {
      assert.strictEqual(clampScale(2.5), SCALE_MAX);
      assert.strictEqual(computeBtnPx(2.5), Math.round(52 * 1.6));
    });
  });

  describe('Pinned apps collection logic', () => {
    function isPinned(list, instance) {
      return list.some(p => p.instance === instance);
    }

    function pinApp(list, win) {
      if (win && !isPinned(list, win.instance)) {
        return [...list, { instance: win.instance, label: win.label, exec: win.exec || win.instance, iconSvg: win.iconSvg }];
      }
      return list;
    }

    function unpinApp(list, instance) {
      return list.filter(p => p.instance !== instance);
    }

    it('pins an unpinned app', () => {
      let list = [];
      const app = { instance: 'dev-central', label: 'Dev Central', exec: 'dev-central' };
      list = pinApp(list, app);
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].instance, 'dev-central');
      assert.ok(isPinned(list, 'dev-central'));
    });

    it('does not duplicate already pinned apps', () => {
      let list = [{ instance: 'dev-central', label: 'Dev Central' }];
      list = pinApp(list, { instance: 'dev-central', label: 'Dev Central' });
      assert.strictEqual(list.length, 1);
    });

    it('unpins an existing app', () => {
      let list = [
        { instance: 'dev-central', label: 'Dev Central' },
        { instance: 'git-projects', label: 'Git Projects' },
      ];
      list = unpinApp(list, 'dev-central');
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].instance, 'git-projects');
      assert.strictEqual(isPinned(list, 'dev-central'), false);
    });
  });
});
