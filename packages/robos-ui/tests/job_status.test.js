'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Minimal DOM shim so <robos-job-status> can be instantiated and tested in pure Node
class MockNode {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this._attrs = new Map();
    this._listeners = new Map();
    this.children = [];
    this.parentNode = null;
    this.innerHTML = '';
    this.textContent = '';
    this.style = {};
    this._subNodes = new Map();
    const classes = new Set();
    this.classList = {
      add: (...cs) => cs.forEach(c => classes.add(c)),
      remove: (...cs) => cs.forEach(c => classes.delete(c)),
      contains: (c) => classes.has(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classes.has(c)) { classes.delete(c); return false; }
          classes.add(c);
          return true;
        }
        if (force) classes.add(c);
        else classes.delete(c);
        return Boolean(force);
      },
    };
  }

  getAttribute(k) { return this._attrs.has(k) ? this._attrs.get(k) : null; }
  hasAttribute(k) { return this._attrs.has(k); }
  setAttribute(k, v) {
    const prev = this.getAttribute(k);
    this._attrs.set(k, String(v));
    if (typeof this.attributeChangedCallback === 'function' && prev !== String(v)) {
      this.attributeChangedCallback(k, prev, String(v));
    }
  }
  removeAttribute(k) { this._attrs.delete(k); }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const arr = this._listeners.get(type);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  }
  dispatchEvent(ev) {
    ev.target = ev.target || this;
    for (const fn of (this._listeners.get(ev.type) || [])) fn(ev);
    return true;
  }

  appendChild(el) {
    el.parentNode = this;
    this.children.push(el);
    return el;
  }
  removeChild(el) {
    const i = this.children.indexOf(el);
    if (i >= 0) this.children.splice(i, 1);
    el.parentNode = null;
    return el;
  }
  contains(other) {
    let cur = other;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentNode;
    }
    return false;
  }
  getBoundingClientRect() {
    return { left: 900, right: 990, top: 696, bottom: 720, width: 90, height: 24 };
  }
  querySelector(sel) {
    if (!this._subNodes.has(sel)) {
      this._subNodes.set(sel, new MockNode('span'));
    }
    return this._subNodes.get(sel);
  }
}

global.HTMLElement = MockNode;
global.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
    this.bubbles = Boolean(init.bubbles);
  }
};
global.window = { innerWidth: 1280, innerHeight: 720 };
global.document = {
  head: new MockNode('head'),
  body: new MockNode('body'),
  getElementById: () => null,
  createElement: (tag) => new MockNode(tag),
  addEventListener: () => {},
  removeEventListener: () => {},
};
const reg = new Map();
global.customElements = {
  get: (n) => reg.get(n),
  define: (n, cls) => reg.set(n, cls),
};

const { RobosJobManager, RobosJobStatus, RobosJobs } = require('../robos-job-status.js');

test('RobosJobManager tracks start, step updates, completion, failure, and cancellation', () => {
  const mgr = new RobosJobManager({ maxHistory: 6 });
  const events = [];
  const unsub = mgr.subscribe((e) => events.push(e));

  const kdenliveJob = mgr.startJob({
    title: 'Save to Kdenlive Project',
    category: 'kdenlive',
    detail: 'Rendering 48 kHz stereo mixdown...',
    progress: 15,
  });

  assert.equal(mgr.getSnapshot().runningCount, 1);
  assert.equal(kdenliveJob.getSnapshot().category, 'KDENLIVE');
  assert.equal(kdenliveJob.getSnapshot().progress, 15);

  kdenliveJob.step('Aligning video tracks in MLT XML...', 72);
  assert.equal(kdenliveJob.getSnapshot().progress, 72);
  assert.equal(kdenliveJob.getSnapshot().steps.length, 2);

  kdenliveJob.complete({
    detail: 'Synced band-session.kdenlive (1 audio + 2 video tracks)',
    outputPath: '/tmp/band-session.kdenlive',
    actionLabel: 'Reveal',
  });

  const snapAfter = mgr.getSnapshot();
  assert.equal(snapAfter.runningCount, 0);
  assert.equal(snapAfter.totalCount, 1);
  assert.equal(snapAfter.jobs[0].status, 'completed');
  assert.equal(snapAfter.jobs[0].progress, 100);
  assert.equal(snapAfter.jobs[0].outputPath, '/tmp/band-session.kdenlive');
  assert.ok(events.length >= 3);

  const failHandle = mgr.startJob({ title: 'Export MP3 Mixdown', category: 'MIXDOWN' });
  failHandle.fail(new Error('FFmpeg exited with code 1'));
  assert.equal(mgr.getSnapshot().failedCount, 1);
  assert.equal(mgr.getSnapshot().jobs[0].detail, 'FFmpeg exited with code 1');

  const cancelHandle = mgr.startJob({ title: 'Export WAV Mixdown', category: 'MIXDOWN' });
  cancelHandle.cancel('Save dialog canceled');
  assert.equal(mgr.getSnapshot().jobs[0].status, 'canceled');

  mgr.clearFinished();
  assert.equal(mgr.getSnapshot().totalCount, 0);
  unsub();
});

test('RobosJobManager.run wraps async exports with auto-complete, cancel, and error capture', async () => {
  const mgr = new RobosJobManager();

  // 1. Successful WAV/MP3 export returning { ok: true, filePath }
  const wavRes = await mgr.run({
    title: 'Export Mixdown (MP3)',
    category: 'MIXDOWN',
    detail: 'Encoding 320 kbps MP3...',
  }, async (job) => {
    job.update({ progress: 55, detail: 'Mastering true-peak ceiling...' });
    return { ok: true, filePath: '/tmp/master.mp3' };
  });

  assert.equal(wavRes.filePath, '/tmp/master.mp3');
  assert.equal(mgr.getSnapshot().jobs[0].status, 'completed');
  assert.equal(mgr.getSnapshot().jobs[0].outputPath, '/tmp/master.mp3');
  assert.equal(mgr.getSnapshot().jobs[0].actionLabel, 'Reveal');

  // 2. Canceled save dialog returning { ok: false, canceled: true }
  const cancelRes = await mgr.run({ title: 'Save to Kdenlive', category: 'KDENLIVE' }, async () => {
    return { ok: false, canceled: true };
  });
  assert.equal(cancelRes.canceled, true);
  assert.equal(mgr.getSnapshot().jobs[0].status, 'canceled');

  // 3. Thrown exception marks job failed and rethrows
  await assert.rejects(
    () => mgr.run({ title: 'Broken Export', category: 'MIXDOWN' }, async () => {
      throw new Error('Disk full');
    }),
    /Disk full/
  );
  assert.equal(mgr.getSnapshot().jobs[0].status, 'failed');
  assert.equal(mgr.getSnapshot().jobs[0].detail, 'Disk full');
});

test('<robos-job-status> renders bottom spinner pill, toggles popover on click, and has zero emojis', () => {
  assert.equal(reg.get('robos-job-status'), RobosJobStatus);
  assert.ok(RobosJobs && typeof RobosJobs.run === 'function');

  const mgr = new RobosJobManager();
  const el = new RobosJobStatus();
  el.setAttribute('idle-label', 'JOBS');
  el.manager = mgr;
  el.connectedCallback();

  // Idle state
  assert.equal(el._pillBtn.classList.contains('is-running'), false);
  assert.equal(el._pillBtn.querySelector('.rjs-pill-label').textContent, 'JOBS');
  assert.equal(el._pillBtn.querySelector('.rjs-pill-meta').textContent, '0');

  // Start running job -> spinner active + label + progress %
  const job = el.startJob({
    title: 'Syncing Kdenlive Project',
    category: 'KDENLIVE',
    progress: 40,
    detail: 'Writing stereo WAV...',
  });
  assert.equal(el._pillBtn.classList.contains('is-running'), true);
  assert.equal(el._pillBtn.querySelector('.rjs-pill-label').textContent, 'Syncing Kdenlive Project');
  assert.equal(el._pillBtn.querySelector('.rjs-pill-meta').textContent, '40%');
  assert.ok(el._pillBtn.querySelector('.rjs-ico').innerHTML.includes('rjs-spin-svg'));

  // Clicking the bottom toolbar pill toggles the status popover
  assert.equal(el._isOpen, false);
  el.togglePopover();
  assert.equal(el._isOpen, true);
  assert.equal(el._popoverEl.classList.contains('hidden'), false);
  const listHtml = el._popoverEl.querySelector('.rjs-pop-list').innerHTML;
  assert.ok(listHtml.includes('Syncing Kdenlive Project'));
  assert.ok(listHtml.includes('KDENLIVE'));

  // Complete job and close popover
  job.complete({ detail: 'Done', outputPath: '/tmp/out.kdenlive', actionLabel: 'Reveal' });
  assert.equal(el._pillBtn.classList.contains('is-running'), false);
  assert.equal(el._pillBtn.querySelector('.rjs-pill-meta').textContent, '1');

  el.togglePopover();
  assert.equal(el._isOpen, false);
  el.disconnectedCallback();

  // Verify zero Unicode emojis in robos-job-status.js source
  const src = fs.readFileSync(path.join(__dirname, '..', 'robos-job-status.js'), 'utf8');
  const emojiRegex = /\p{Extended_Pictographic}|[\u2600-\u27BF\uFE0F\u25CF\u25CB\u25A0\u25B6\u23F8-\u23FA]/gu;
  assert.deepEqual(src.match(emojiRegex) || [], [], 'robos-job-status.js must use pure SVG icons with zero emojis');
});
